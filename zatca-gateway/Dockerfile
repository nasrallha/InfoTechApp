# ============================================================
# ZATCA Gateway على Linux (Docker)
# البناء من فولدر المشروع الرئيسي (عشان يوصل لفولدر الـ SDK):
#   docker build -f zatca-gateway/Dockerfile -t zatca-gateway .
#   docker run -d --name zatca-gateway --restart unless-stopped \
#     -p 127.0.0.1:5089:5089 -e ZATCA_GATEWAY_KEY=... zatca-gateway
# ============================================================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY zatca-einvoicing-sdk-DotNet-238-R3.4.6/Lib/Dot-Net8/DLL ./zatca-einvoicing-sdk-DotNet-238-R3.4.6/Lib/Dot-Net8/DLL
COPY zatca-einvoicing-sdk-DotNet-238-R3.4.6/Data/Rules ./zatca-einvoicing-sdk-DotNet-238-R3.4.6/Data/Rules
COPY zatca-einvoicing-sdk-DotNet-238-R3.4.6/Data/Certificates ./zatca-einvoicing-sdk-DotNet-238-R3.4.6/Data/Certificates
COPY zatca-gateway/ ./zatca-gateway/
RUN dotnet publish zatca-gateway/ZatcaGateway.csproj -c Release -o /app

# صورة Debian (فيها ICU والمناطق الزمنية اللي الـ SDK محتاجها لتوقيت السعودية)
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
COPY --from=build /app .
ENV Gateway__Urls=http://0.0.0.0:5089
EXPOSE 5089
ENTRYPOINT ["dotnet", "ZatcaGateway.dll"]
