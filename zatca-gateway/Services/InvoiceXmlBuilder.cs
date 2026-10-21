using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using Microsoft.Extensions.Options;
using ZatcaGateway.Models;

namespace ZatcaGateway.Services;

// ============================================================
// بناء فاتورة UBL 2.1 حسب مواصفات الهيئة (قبل التوقيع)
// - الـ SDK هو اللي بيضيف التوقيع والـ QR (UBLExtensions / Signature / QR)
// - الخصومات على مستوى السطر (خصم الصنف + نصيبه من خصم الفاتورة) → AllowanceCharge للسطر
// - الضريبة في الإجمالي محسوبة لكل فئة = الوعاء × النسبة (قاعدة BR-CO-17)
// - لو الإجمالي المتوقع (من قاعدة البيانات) مختلف بقروش → PayableRoundingAmount
// ============================================================
public sealed class InvoiceXmlBuilder
{
    private const string NsInvoice = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
    private const string NsCac = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
    private const string NsCbc = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
    private const string NsExt = "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    private static readonly HashSet<string> SellerSchemes = new() { "CRN", "MOM", "MLS", "700", "SAG", "OTH" };
    private static readonly HashSet<string> BuyerSchemes = new() { "TIN", "CRN", "MOM", "MLS", "700", "SAG", "NAT", "GCC", "IQA", "PAS", "OTH" };
    private static readonly HashSet<string> Categories = new() { "S", "Z", "E", "O" };

    private readonly int _priceDecimals;

    public InvoiceXmlBuilder(IOptions<GatewayOptions> options)
    {
        _priceDecimals = Math.Clamp(options.Value.PriceDecimals, 2, 6);
    }

    private static decimal R2(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
    private static string Money(decimal v) => R2(v).ToString("0.00", Inv);
    private static string Qty(decimal v) => v.ToString("0.######", Inv);
    private static string Pct(decimal v) => v.ToString("0.00", Inv);
    private string PriceText(decimal v) =>
        v.ToString("0.00" + new string('#', _priceDecimals - 2), Inv);

    // ------------------------------------------------------------
    // الحسابات
    // ------------------------------------------------------------
    private sealed record LineCalc(
        InvoiceLineDto Src, decimal Price, decimal Gross, decimal Net, decimal Adjustment,
        string Category, decimal Rate, decimal Tax);

    private sealed record TaxGroup(
        string Category, decimal Rate, string? ReasonCode, string? Reason, decimal Taxable, decimal Tax);

    public sealed record Totals(
        decimal LineExtension, decimal TaxExclusive, decimal Tax, decimal TaxInclusive,
        decimal Prepaid, decimal Rounding, decimal Payable);

    private List<LineCalc> CalcLines(InvoiceDto inv)
    {
        var list = new List<LineCalc>();
        foreach (var l in inv.Lines)
        {
            var category = (l.TaxCategory ?? "S").Trim().ToUpperInvariant();
            var rate = category == "O" ? 0m : l.TaxPercent;
            var price = Math.Round(l.UnitPrice, _priceDecimals, MidpointRounding.AwayFromZero);
            var gross = R2(l.Quantity * price);
            var net = l.NetAmount.HasValue ? R2(l.NetAmount.Value) : R2(gross - R2(l.Discount));
            var tax = l.TaxAmount.HasValue ? R2(l.TaxAmount.Value) : R2(net * rate / 100m);
            list.Add(new LineCalc(l, price, gross, net, R2(gross - net), category, rate, tax));
        }
        return list;
    }

    private static List<TaxGroup> CalcGroups(List<LineCalc> lines) =>
        lines
            .GroupBy(l => (l.Category, l.Rate,
                Code: l.Category == "S" ? null : l.Src.ExemptionReasonCode?.Trim(),
                Reason: l.Category == "S" ? null : l.Src.ExemptionReason?.Trim()))
            .Select(g =>
            {
                var taxable = R2(g.Sum(x => x.Net));
                return new TaxGroup(g.Key.Category, g.Key.Rate, g.Key.Code, g.Key.Reason,
                    taxable, R2(taxable * g.Key.Rate / 100m));
            })
            .ToList();

    private static Totals CalcTotals(InvoiceDto inv, List<LineCalc> lines, List<TaxGroup> groups)
    {
        var lineExt = R2(lines.Sum(l => l.Net));
        var tax = R2(groups.Sum(g => g.Tax));
        var incl = R2(lineExt + tax);
        var prepaid = R2(inv.PrepaidAmount);
        var payable = R2(incl - prepaid);
        var rounding = 0m;
        if (inv.PayableAmount.HasValue)
        {
            rounding = R2(inv.PayableAmount.Value - payable);
            if (Math.Abs(rounding) > 1m)
                throw new GatewayException("PayableMismatch",
                    $"Expected payable {Money(inv.PayableAmount.Value)} differs from calculated {Money(payable)}",
                    new { expected = inv.PayableAmount.Value, calculated = payable });
        }
        return new Totals(lineExt, lineExt, tax, incl, prepaid, rounding, R2(payable + rounding));
    }

    // ------------------------------------------------------------
    // التحقق من البيانات قبل البناء (رسائل واضحة بدل رفض الهيئة)
    // ------------------------------------------------------------
    private static void Validate(InvoiceDto inv)
    {
        var errors = new List<object>();
        void Err(string field, string message) => errors.Add(new { field, message });
        bool Blank(string? v) => string.IsNullOrWhiteSpace(v);

        if (Blank(inv.Id)) Err("id", "Invoice number is required");
        if (!Guid.TryParse(inv.Uuid, out _)) Err("uuid", "A valid UUID is required");
        if (!DateTime.TryParseExact(inv.IssueDate, "yyyy-MM-dd", Inv, DateTimeStyles.None, out _))
            Err("issueDate", "issueDate must be yyyy-MM-dd");
        if (!DateTime.TryParseExact(inv.IssueTime, "HH:mm:ss", Inv, DateTimeStyles.None, out _))
            Err("issueTime", "issueTime must be HH:mm:ss");
        var kind = (inv.Kind ?? "").ToLowerInvariant();
        if (kind is not ("simplified" or "standard")) Err("kind", "kind must be simplified | standard");
        var type = (inv.DocumentType ?? "").ToLowerInvariant();
        if (type is not ("invoice" or "credit" or "debit")) Err("documentType", "documentType must be invoice | credit | debit");
        if (inv.Icv <= 0) Err("icv", "ICV must be greater than zero");
        if (Blank(inv.Pih)) Err("pih", "PIH (previous invoice hash) is required");
        if (!string.Equals(inv.Currency, "SAR", StringComparison.OrdinalIgnoreCase)) Err("currency", "Only SAR is supported");
        if (type is "credit" or "debit")
        {
            if (Blank(inv.BillingReference)) Err("billingReference", "Original invoice number is required for credit/debit notes");
            if (Blank(inv.Reason)) Err("reason", "Reason is required for credit/debit notes");
        }

        // البائع
        var s = inv.Seller;
        if (Blank(s.Name)) Err("seller.name", "Seller name is required");
        if (s.VatNumber is null || !Regex.IsMatch(s.VatNumber, "^3[0-9]{13}3$"))
            Err("seller.vatNumber", "Seller VAT number must be 15 digits starting and ending with 3");
        if (Blank(s.IdValue) || !SellerSchemes.Contains((s.IdScheme ?? "").ToUpperInvariant()))
            Err("seller.id", "Seller identifier is required (CRN | MOM | MLS | 700 | SAG | OTH)");
        ValidateAddress(s.Address, "seller.address", Err, strict: true);

        // المشتري (إجباري في الضريبية)
        if (kind == "standard")
        {
            var b = inv.Buyer;
            if (b == null || Blank(b.Name)) Err("buyer.name", "Buyer name is required for standard invoices");
            if (b != null)
            {
                var hasVat = !Blank(b.VatNumber);
                if (hasVat && !Regex.IsMatch(b.VatNumber!, "^3[0-9]{13}3$"))
                    Err("buyer.vatNumber", "Buyer VAT number must be 15 digits starting and ending with 3");
                // التصدير: العميل برّه المملكة مالوش رقم ضريبي سعودي، والمعرّف اختياري
                var exports = inv.Flags?.Exports == true;
                if (exports && hasVat)
                    Err("buyer.vatNumber", "Export invoices must not include a Saudi buyer VAT number");
                if (!hasVat && !exports && (Blank(b.IdValue) || !BuyerSchemes.Contains((b.IdScheme ?? "").ToUpperInvariant())))
                    Err("buyer.id", "Buyer VAT number or another identifier (CRN, NAT, IQA, ...) is required");
                if (exports && !Blank(b.IdValue) && !BuyerSchemes.Contains((b.IdScheme ?? "").ToUpperInvariant()))
                    Err("buyer.id", "Buyer identifier type is not valid");
                ValidateAddress(b.Address, "buyer.address", Err, strict: string.Equals(b.Address?.CountryCode ?? "SA", "SA", StringComparison.OrdinalIgnoreCase));
            }
        }

        // السطور
        if (inv.Lines.Count == 0) Err("lines", "At least one line is required");
        for (var i = 0; i < inv.Lines.Count; i++)
        {
            var l = inv.Lines[i];
            var p = $"lines[{i}]";
            if (Blank(l.Name)) Err($"{p}.name", "Item name is required");
            if (l.Quantity <= 0) Err($"{p}.quantity", "Quantity must be greater than zero");
            if (l.UnitPrice < 0) Err($"{p}.unitPrice", "Price can't be negative");
            if (l.Discount < 0) Err($"{p}.discount", "Discount can't be negative");
            var c = (l.TaxCategory ?? "").ToUpperInvariant();
            if (!Categories.Contains(c)) Err($"{p}.taxCategory", "taxCategory must be S | Z | E | O");
            else if (c == "S" && l.TaxPercent <= 0) Err($"{p}.taxPercent", "Standard rated items need a tax percent");
            else if (c != "S")
            {
                if (c != "O" && l.TaxPercent != 0) Err($"{p}.taxPercent", "Zero rated / exempt items must have 0%");
                if (Blank(l.ExemptionReasonCode)) Err($"{p}.exemptionReasonCode", "Exemption reason code (VATEX-SA-..) is required");
            }
        }

        if (errors.Count > 0)
            throw new GatewayException("InvalidInvoice", "Invoice data is not valid", errors);
    }

    private static void ValidateAddress(AddressDto? a, string prefix, Action<string, string> err, bool strict)
    {
        if (a == null)
        {
            err(prefix, "Address is required");
            return;
        }
        if (string.IsNullOrWhiteSpace(a.Street)) err($"{prefix}.street", "Street is required");
        if (string.IsNullOrWhiteSpace(a.City)) err($"{prefix}.city", "City is required");
        if (!strict) return;
        if (a.BuildingNumber is null || !Regex.IsMatch(a.BuildingNumber, "^[0-9]{4}$"))
            err($"{prefix}.buildingNumber", "Building number must be 4 digits");
        if (a.PostalCode is null || !Regex.IsMatch(a.PostalCode, "^[0-9]{5}$"))
            err($"{prefix}.postalCode", "Postal code must be 5 digits");
        if (string.IsNullOrWhiteSpace(a.District)) err($"{prefix}.district", "District is required");
    }

    // ------------------------------------------------------------
    // البناء
    // ------------------------------------------------------------
    public (string Xml, Totals Totals) Build(InvoiceDto inv)
    {
        Validate(inv);
        var lines = CalcLines(inv);
        var groups = CalcGroups(lines);
        var totals = CalcTotals(inv, lines, groups);

        var kind = inv.Kind.ToLowerInvariant();
        var type = inv.DocumentType.ToLowerInvariant();
        const string cur = "SAR";

        var settings = new XmlWriterSettings
        {
            Indent = true,
            IndentChars = "    ",
            Encoding = new UTF8Encoding(false),
            OmitXmlDeclaration = false,
        };
        using var ms = new MemoryStream();
        using (var w = XmlWriter.Create(ms, settings))
        {
            w.WriteStartDocument();
            w.WriteStartElement("Invoice", NsInvoice);
            w.WriteAttributeString("xmlns", "cac", null, NsCac);
            w.WriteAttributeString("xmlns", "cbc", null, NsCbc);
            w.WriteAttributeString("xmlns", "ext", null, NsExt);

            Cbc(w, "ProfileID", "reporting:1.0");
            Cbc(w, "ID", inv.Id.Trim());
            Cbc(w, "UUID", inv.Uuid.Trim());
            Cbc(w, "IssueDate", inv.IssueDate);
            Cbc(w, "IssueTime", inv.IssueTime);

            w.WriteStartElement("cbc", "InvoiceTypeCode", NsCbc);
            w.WriteAttributeString("name", TypeName(kind, inv.Flags));
            w.WriteString(type switch { "credit" => "381", "debit" => "383", _ => "388" });
            w.WriteEndElement();

            if (!string.IsNullOrWhiteSpace(inv.Note)) Cbc(w, "Note", inv.Note.Trim());
            Cbc(w, "DocumentCurrencyCode", cur);
            Cbc(w, "TaxCurrencyCode", cur);

            if (type is "credit" or "debit")
            {
                w.WriteStartElement("cac", "BillingReference", NsCac);
                w.WriteStartElement("cac", "InvoiceDocumentReference", NsCac);
                Cbc(w, "ID", inv.BillingReference!.Trim());
                w.WriteEndElement();
                w.WriteEndElement();
            }

            // ICV
            w.WriteStartElement("cac", "AdditionalDocumentReference", NsCac);
            Cbc(w, "ID", "ICV");
            Cbc(w, "UUID", inv.Icv.ToString(Inv));
            w.WriteEndElement();

            // PIH
            w.WriteStartElement("cac", "AdditionalDocumentReference", NsCac);
            Cbc(w, "ID", "PIH");
            w.WriteStartElement("cac", "Attachment", NsCac);
            w.WriteStartElement("cbc", "EmbeddedDocumentBinaryObject", NsCbc);
            w.WriteAttributeString("mimeCode", "text/plain");
            w.WriteString(inv.Pih.Trim());
            w.WriteEndElement();
            w.WriteEndElement();
            w.WriteEndElement();

            // البائع
            w.WriteStartElement("cac", "AccountingSupplierParty", NsCac);
            WriteParty(w, inv.Seller, seller: true);
            w.WriteEndElement();

            // المشتري (فاضي في المبسطة لو مفيش بيانات)
            w.WriteStartElement("cac", "AccountingCustomerParty", NsCac);
            if (inv.Buyer != null && !string.IsNullOrWhiteSpace(inv.Buyer.Name))
                WriteParty(w, inv.Buyer, seller: false);
            w.WriteEndElement();

            // تاريخ التوريد
            w.WriteStartElement("cac", "Delivery", NsCac);
            Cbc(w, "ActualDeliveryDate", string.IsNullOrWhiteSpace(inv.SupplyDate) ? inv.IssueDate : inv.SupplyDate!);
            if (!string.IsNullOrWhiteSpace(inv.SupplyEndDate)) Cbc(w, "LatestDeliveryDate", inv.SupplyEndDate!);
            w.WriteEndElement();

            // طريقة الدفع (+ سبب الإشعار)
            w.WriteStartElement("cac", "PaymentMeans", NsCac);
            Cbc(w, "PaymentMeansCode", string.IsNullOrWhiteSpace(inv.PaymentMeansCode) ? "10" : inv.PaymentMeansCode.Trim());
            if (type is "credit" or "debit") Cbc(w, "InstructionNote", inv.Reason!.Trim());
            w.WriteEndElement();

            // إجمالي الضريبة (مرة بدون تفصيل ومرة بالتفصيل حسب الفئة)
            w.WriteStartElement("cac", "TaxTotal", NsCac);
            Amount(w, "TaxAmount", totals.Tax, cur);
            w.WriteEndElement();

            w.WriteStartElement("cac", "TaxTotal", NsCac);
            Amount(w, "TaxAmount", totals.Tax, cur);
            foreach (var g in groups)
            {
                w.WriteStartElement("cac", "TaxSubtotal", NsCac);
                Amount(w, "TaxableAmount", g.Taxable, cur);
                Amount(w, "TaxAmount", g.Tax, cur);
                w.WriteStartElement("cac", "TaxCategory", NsCac);
                w.WriteStartElement("cbc", "ID", NsCbc);
                w.WriteAttributeString("schemeID", "UN/ECE 5305");
                w.WriteAttributeString("schemeAgencyID", "6");
                w.WriteString(g.Category);
                w.WriteEndElement();
                if (g.Category != "O") Cbc(w, "Percent", Pct(g.Rate));
                if (!string.IsNullOrWhiteSpace(g.ReasonCode)) Cbc(w, "TaxExemptionReasonCode", g.ReasonCode!);
                if (!string.IsNullOrWhiteSpace(g.Reason)) Cbc(w, "TaxExemptionReason", g.Reason!);
                w.WriteStartElement("cac", "TaxScheme", NsCac);
                w.WriteStartElement("cbc", "ID", NsCbc);
                w.WriteAttributeString("schemeID", "UN/ECE 5153");
                w.WriteAttributeString("schemeAgencyID", "6");
                w.WriteString("VAT");
                w.WriteEndElement();
                w.WriteEndElement();
                w.WriteEndElement();
                w.WriteEndElement();
            }
            w.WriteEndElement();

            // الإجماليات
            w.WriteStartElement("cac", "LegalMonetaryTotal", NsCac);
            Amount(w, "LineExtensionAmount", totals.LineExtension, cur);
            Amount(w, "TaxExclusiveAmount", totals.TaxExclusive, cur);
            Amount(w, "TaxInclusiveAmount", totals.TaxInclusive, cur);
            Amount(w, "AllowanceTotalAmount", 0m, cur);
            Amount(w, "PrepaidAmount", totals.Prepaid, cur);
            if (totals.Rounding != 0m) Amount(w, "PayableRoundingAmount", totals.Rounding, cur);
            Amount(w, "PayableAmount", totals.Payable, cur);
            w.WriteEndElement();

            // السطور
            for (var i = 0; i < lines.Count; i++) WriteLine(w, lines[i], i + 1, cur);

            w.WriteEndElement();
            w.WriteEndDocument();
        }
        return (Encoding.UTF8.GetString(ms.ToArray()).Trim(), totals);
    }

    private void WriteLine(XmlWriter w, LineCalc l, int index, string cur)
    {
        w.WriteStartElement("cac", "InvoiceLine", NsCac);
        Cbc(w, "ID", index.ToString(Inv));
        w.WriteStartElement("cbc", "InvoicedQuantity", NsCbc);
        w.WriteAttributeString("unitCode", string.IsNullOrWhiteSpace(l.Src.UnitCode) ? "PCE" : l.Src.UnitCode.Trim());
        w.WriteString(Qty(l.Src.Quantity));
        w.WriteEndElement();
        Amount(w, "LineExtensionAmount", l.Net, cur);

        // خصم السطر (أو فرق تقريب بالموجب لو الصافي أكبر من الإجمالي)
        if (l.Adjustment != 0m)
        {
            var isCharge = l.Adjustment < 0m;
            w.WriteStartElement("cac", "AllowanceCharge", NsCac);
            Cbc(w, "ChargeIndicator", isCharge ? "true" : "false");
            if (!isCharge) Cbc(w, "AllowanceChargeReasonCode", "95");
            Cbc(w, "AllowanceChargeReason", isCharge ? "Rounding" : "Discount");
            Amount(w, "Amount", Math.Abs(l.Adjustment), cur);
            w.WriteEndElement();
        }

        w.WriteStartElement("cac", "TaxTotal", NsCac);
        Amount(w, "TaxAmount", l.Tax, cur);
        Amount(w, "RoundingAmount", R2(l.Net + l.Tax), cur);
        w.WriteEndElement();

        w.WriteStartElement("cac", "Item", NsCac);
        Cbc(w, "Name", l.Src.Name.Trim());
        w.WriteStartElement("cac", "ClassifiedTaxCategory", NsCac);
        Cbc(w, "ID", l.Category);
        if (l.Category != "O") Cbc(w, "Percent", Pct(l.Rate));
        w.WriteStartElement("cac", "TaxScheme", NsCac);
        Cbc(w, "ID", "VAT");
        w.WriteEndElement();
        w.WriteEndElement();
        w.WriteEndElement();

        w.WriteStartElement("cac", "Price", NsCac);
        w.WriteStartElement("cbc", "PriceAmount", NsCbc);
        w.WriteAttributeString("currencyID", cur);
        w.WriteString(PriceText(l.Price));
        w.WriteEndElement();
        w.WriteEndElement();

        w.WriteEndElement();
    }

    private static void WriteParty(XmlWriter w, PartyDto p, bool seller)
    {
        w.WriteStartElement("cac", "Party", NsCac);

        if (!string.IsNullOrWhiteSpace(p.IdValue) && !string.IsNullOrWhiteSpace(p.IdScheme))
        {
            w.WriteStartElement("cac", "PartyIdentification", NsCac);
            w.WriteStartElement("cbc", "ID", NsCbc);
            w.WriteAttributeString("schemeID", p.IdScheme.Trim().ToUpperInvariant());
            w.WriteString(p.IdValue.Trim());
            w.WriteEndElement();
            w.WriteEndElement();
        }

        if (p.Address != null) WriteAddress(w, p.Address);

        if (seller || !string.IsNullOrWhiteSpace(p.VatNumber))
        {
            w.WriteStartElement("cac", "PartyTaxScheme", NsCac);
            if (!string.IsNullOrWhiteSpace(p.VatNumber)) Cbc(w, "CompanyID", p.VatNumber.Trim());
            w.WriteStartElement("cac", "TaxScheme", NsCac);
            Cbc(w, "ID", "VAT");
            w.WriteEndElement();
            w.WriteEndElement();
        }

        w.WriteStartElement("cac", "PartyLegalEntity", NsCac);
        Cbc(w, "RegistrationName", p.Name.Trim());
        w.WriteEndElement();

        w.WriteEndElement();
    }

    private static void WriteAddress(XmlWriter w, AddressDto a)
    {
        w.WriteStartElement("cac", "PostalAddress", NsCac);
        Opt(w, "StreetName", a.Street);
        Opt(w, "AdditionalStreetName", a.AdditionalStreet);
        Opt(w, "BuildingNumber", a.BuildingNumber);
        Opt(w, "PlotIdentification", a.AdditionalNumber);
        Opt(w, "CitySubdivisionName", a.District);
        Opt(w, "CityName", a.City);
        Opt(w, "PostalZone", a.PostalCode);
        Opt(w, "CountrySubentity", a.Region);
        w.WriteStartElement("cac", "Country", NsCac);
        Cbc(w, "IdentificationCode", string.IsNullOrWhiteSpace(a.CountryCode) ? "SA" : a.CountryCode.Trim().ToUpperInvariant());
        w.WriteEndElement();
        w.WriteEndElement();
    }

    // 01 ضريبية / 02 مبسطة + 5 خانات: طرف ثالث، اسمية، تصدير، ملخصة، فوترة ذاتية
    private static string TypeName(string kind, InvoiceFlags? f)
    {
        var sb = new StringBuilder(kind == "standard" ? "01" : "02");
        sb.Append(f?.ThirdParty == true ? '1' : '0');
        sb.Append(f?.Nominal == true ? '1' : '0');
        sb.Append(f?.Exports == true ? '1' : '0');
        sb.Append(f?.Summary == true ? '1' : '0');
        sb.Append(f?.SelfBilled == true ? '1' : '0');
        return sb.ToString();
    }

    private static void Cbc(XmlWriter w, string name, string value) =>
        w.WriteElementString("cbc", name, NsCbc, value);

    private static void Opt(XmlWriter w, string name, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value)) Cbc(w, name, value.Trim());
    }

    private static void Amount(XmlWriter w, string name, decimal value, string cur)
    {
        w.WriteStartElement("cbc", name, NsCbc);
        w.WriteAttributeString("currencyID", cur);
        w.WriteString(Money(value));
        w.WriteEndElement();
    }
}
