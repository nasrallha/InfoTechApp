"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import {
  CloudDownloadOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import {
  deleteAgentAction,
  pairCodeAction,
  setAgentActiveAction,
} from "@/actions/print-agent.actions";
import { formatDateTime } from "@/lib/dates";
import { C } from "@/lib/theme";

const AGENT_FILE = "/downloads/InfoTech-Print-Agent.exe";

// ============================================================
// وسيط الطباعة (لفرع): التحميل + كود الربط + الأجهزة المربوطة
// - «تحميل الوسيط»: ملف واحد .exe (فيه Node)، بيسأل عن الرابط والكود أول مرة
// - «ملف إعداد الفرع»: agent-setup.json جنب البرنامج ← يتربط لوحده من غير أسئلة
// - كود الربط ثابت للفرع (ينفع لأكتر من جهاز)، و«كود جديد» بيبطّل القديم
// ============================================================
export default function PrintAgentCard({ branchId, agents, canManage }) {
  const t = useTranslations("PrintAgent");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [code, setCode] = useState(null);
  const [origin, setOrigin] = useState("");
  const rows = agents.filter((a) => a.branchId === branchId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const loadCode = async (regenerate = false) => {
    const res = await pairCodeAction({ branchId, regenerate });
    if (!res.success) return showActionError(res, tAlerts, locale);
    setCode(res.data);
    if (regenerate) message.success(t("CodeRenewed"));
  };
  useEffect(() => {
    if (!branchId || !canManage) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(null);
    loadCode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, canManage]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t("Copied"));
    } catch {
      message.info(text);
    }
  };

  // ملف الإعداد: الرابط + كود الربط ← يتحط جنب الوسيط
  const downloadSetup = () => {
    const blob = new Blob(
      [JSON.stringify({ serverUrl: origin, pairCode: code }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "agent-setup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const act = async (fn) => {
    const res = await fn();
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
  };

  return (
    <Card size="small" className="mb-3 print-agent-card" title={t("Title")}>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>{t("Hint")}</div>
      <Space wrap className="mb-3">
        <Button type="primary" icon={<CloudDownloadOutlined />} href={AGENT_FILE} download>
          {t("Download")}
        </Button>
        {canManage && (
          <Button icon={<FileTextOutlined />} disabled={!code} onClick={downloadSetup}>
            {t("DownloadSetup")}
          </Button>
        )}
      </Space>
      {canManage && (
        <div className="print-agent-codes">
          <div>
            <div className="print-agent-label">{t("ServerUrl")}</div>
            <Space.Compact style={{ width: "100%" }}>
              <Input readOnly dir="ltr" value={origin} />
              <Button icon={<CopyOutlined />} onClick={() => copy(origin)} />
            </Space.Compact>
          </div>
          <div>
            <div className="print-agent-label">{t("PairCode")}</div>
            <Space.Compact style={{ width: "100%" }}>
              <Input readOnly dir="ltr" value={code ?? ""} className="print-agent-code" />
              <Button icon={<CopyOutlined />} disabled={!code} onClick={() => copy(code)} />
              <Popconfirm
                title={t("ConfirmRenew")}
                okButtonProps={{ danger: true }}
                onConfirm={() => loadCode(true)}
              >
                <Button icon={<ReloadOutlined />} title={t("Renew")} />
              </Popconfirm>
            </Space.Compact>
          </div>
        </div>
      )}
      <Alert type="info" showIcon className="mt-3 mb-3" title={t("Steps")} />
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 620 }}
        locale={{ emptyText: t("NoAgents") }}
        columns={[
          {
            title: t("Device"),
            render: (_, a) => (
              <span>
                <b>{a.name}</b>
                {a.hostName && a.hostName !== a.name && (
                  <div style={{ color: C.muted, fontSize: 12 }}>{a.hostName}</div>
                )}
              </span>
            ),
          },
          {
            title: t("Status"),
            width: 120,
            render: (_, a) =>
              !a.isActive ? (
                <Tag>{t("Stopped")}</Tag>
              ) : a.online ? (
                <Tag color="green">{t("Online")}</Tag>
              ) : (
                <Tag color="red">{t("Offline")}</Tag>
              ),
          },
          {
            title: t("LastSeen"),
            width: 160,
            render: (_, a) => (a.lastSeenAt ? formatDateTime(a.lastSeenAt) : "—"),
          },
          {
            title: t("WinPrinters"),
            render: (_, a) => (a.winPrinters.length ? a.winPrinters.length : "—"),
            width: 100,
          },
          ...(canManage
            ? [
                {
                  title: "",
                  width: 110,
                  render: (_, a) => (
                    <Space size={4}>
                      <Switch
                        size="small"
                        checked={a.isActive}
                        title={t("Enabled")}
                        onChange={(v) =>
                          act(() => setAgentActiveAction({ id: a.id, isActive: v }))
                        }
                      />
                      <Popconfirm
                        title={t("ConfirmDelete")}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => act(() => deleteAgentAction(a.id))}
                      >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}
