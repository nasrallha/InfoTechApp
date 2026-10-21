"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Space, Spin, Tree } from "antd";
import {
  CheckOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DesktopOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HddOutlined,
  HomeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { showActionError } from "@/components/common/actionError";
import {
  browseFoldersAction,
  createFolderAction,
  folderTreeStartAction,
  revealFolderAction,
} from "@/actions/backup.actions";

const SHORTCUT_ICON = {
  current: <CloudServerOutlined />,
  desktop: <DesktopOutlined />,
  documents: <FileTextOutlined />,
  downloads: <DownloadOutlined />,
  home: <HomeOutlined />,
  program: <CodeOutlined />,
};

// ============================================================
// اختيار مجلد على السيرفر (الجهاز اللي شغال عليه البرنامج) - زي الـ Explorer
// - شجرة: البارتشنات (C: D: ...) وكل مجلد بيتفتح بالسهم (المجلدات بتتحمّل وقت الفتح)
// - اختصارات: مجلد الحفظ الحالي، سطح المكتب، المستندات، التنزيلات، مجلد البرنامج
// - خانة المسار: الصق أي مسار ودوس Enter يروح له على طول
// - مجلد جديد جوه المجلد المختار، و"اختيار المجلد ده"
// ============================================================
export default function FolderBrowser({ open, start, onClose, onSelect }) {
  const [roots, setRoots] = useState([]);
  const [shortcuts, setShortcuts] = useState([]);
  // مجلدات كل مسار اتفتح: { [path]: [{ name, path }] }
  const [children, setChildren] = useState({});
  const [expanded, setExpanded] = useState([]);
  const [selected, setSelected] = useState(null);
  const [writable, setWritable] = useState({});
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const treeBox = useRef(null);
  const locale = useLocale();
  const t = useTranslations("Backup");
  const tAlerts = useTranslations("Alerts");
  const fail = (res) => showActionError(res, tAlerts, locale);

  // فتح الشجرة على مسار: كل المستويات اللي في الطريق بتتحمّل وتتفتح
  const reveal = async (dir) => {
    if (!dir?.trim()) return;
    setLoading(true);
    const res = await revealFolderAction({ dir });
    setLoading(false);
    if (!res.success) return fail(res);
    const { path, chain } = res.data;
    if (!path) return;
    setChildren((prev) => {
      const next = { ...prev };
      for (const lvl of chain) next[lvl.path] = lvl.folders;
      return next;
    });
    setExpanded((prev) => [
      ...new Set([...prev, ...chain.slice(0, -1).map((l) => l.path)]),
    ]);
    setWritable((w) => ({ ...w, [path]: res.data.writable }));
    setSelected(path);
    setTyped(path);
    // المجلد المختار يبان في الشاشة
    setTimeout(() => {
      treeBox.current
        ?.querySelector(".ant-tree-node-selected")
        ?.scrollIntoView({ block: "center" });
    }, 50);
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const res = await folderTreeStartAction();
      setLoading(false);
      if (!res.success) return fail(res);
      setRoots(res.data.roots);
      setShortcuts(res.data.shortcuts);
      if (start) reveal(start);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // تحميل مجلدات مستوى وقت فتحه بالسهم
  const loadData = async (node) => {
    if (children[node.key]) return;
    const res = await browseFoldersAction({ dir: node.key });
    if (!res.success) {
      fail(res);
      setChildren((c) => ({ ...c, [node.key]: [] }));
      return;
    }
    setChildren((c) => ({ ...c, [node.key]: res.data.folders }));
    setWritable((w) => ({ ...w, [node.key]: res.data.writable }));
  };

  const select = async (key) => {
    setSelected(key);
    setTyped(key);
    if (writable[key] === undefined) {
      const res = await browseFoldersAction({ dir: key });
      if (res.success) {
        setWritable((w) => ({ ...w, [key]: res.data.writable }));
        setChildren((c) => ({ ...c, [key]: res.data.folders }));
      }
    }
  };

  // بيانات الشجرة من المستويات اللي اتحمّلت
  const treeData = useMemo(() => {
    const build = (list, isRoot) =>
      list.map((f) => {
        const kids = children[f.path];
        return {
          key: f.path,
          title: <bdi dir="ltr">{f.name}</bdi>,
          icon: isRoot ? <HddOutlined /> : <FolderOutlined />,
          isLeaf: kids ? kids.length === 0 : undefined,
          children: kids ? build(kids, false) : undefined,
        };
      });
    return build(roots, true);
  }, [roots, children]);

  const create = async () => {
    if (!selected || !newName.trim()) return;
    setCreating(true);
    const res = await createFolderAction({ parent: selected, name: newName });
    setCreating(false);
    if (!res.success) return fail(res);
    setNewName("");
    // المجلد الجديد: نحدّث مجلدات الأب ونختاره
    const parent = selected;
    setChildren((c) => {
      const next = { ...c };
      delete next[parent];
      return next;
    });
    reveal(res.data.path);
  };

  const refresh = () => {
    setChildren({});
    setExpanded([]);
    if (selected) reveal(selected);
  };

  const canPick = selected && writable[selected];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      title={
        <span>
          <FolderOpenOutlined /> {t("BrowseTitle")}
        </span>
      }
      footer={
        <Space>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={!canPick}
            onClick={() => onSelect(selected)}
          >
            {t("SelectThisFolder")}
          </Button>
        </Space>
      }
    >
      <div className="mb-2" style={{ color: "#888", fontSize: 13 }}>
        {t("BrowseHint")}
      </div>

      {/* المسار: اكتب أو الصق ودوس Enter */}
      <Space.Compact style={{ width: "100%" }} className="mb-2">
        <Input
          dir="ltr"
          className="backup-dir"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onPressEnter={() => reveal(typed)}
          placeholder={t("PathPlaceholder")}
        />
        <Button onClick={() => reveal(typed)} disabled={!typed.trim()}>
          {t("Go")}
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={refresh}
          title={t("Refresh")}
        />
      </Space.Compact>

      <div className="folder-browser">
        {/* الاختصارات */}
        <div className="folder-shortcuts">
          {shortcuts.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`folder-shortcut ${selected === s.path ? "is-active" : ""}`}
              onClick={() => reveal(s.path)}
              title={s.path}
            >
              {SHORTCUT_ICON[s.key]} <span>{t(`shortcut.${s.key}`)}</span>
            </button>
          ))}
        </div>

        {/* الشجرة */}
        <Spin spinning={loading} classNames={{ root: "folder-tree-wrap" }}>
          <div className="folder-tree" ref={treeBox} dir="ltr">
            <Tree
              showIcon
              blockNode
              treeData={treeData}
              loadData={loadData}
              expandedKeys={expanded}
              onExpand={(keys) => setExpanded(keys)}
              selectedKeys={selected ? [selected] : []}
              onSelect={(keys, info) => select(info.node.key)}
              onDoubleClick={(e, node) =>
                setExpanded((prev) =>
                  prev.includes(node.key)
                    ? prev.filter((k) => k !== node.key)
                    : [...prev, node.key],
                )
              }
            />
          </div>
        </Spin>
      </div>

      {selected && writable[selected] === false && (
        <Alert
          type="warning"
          showIcon
          className="mt-2"
          title={t("NotWritable")}
        />
      )}

      {selected && writable[selected] && (
        <Space.Compact style={{ width: "100%" }} className="mt-2">
          <Input
            dir="auto"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={create}
            placeholder={t("NewFolderName")}
            maxLength={100}
          />
          <Button
            icon={<FolderAddOutlined />}
            loading={creating}
            disabled={!newName.trim()}
            onClick={create}
          >
            {t("NewFolder")}
          </Button>
        </Space.Compact>
      )}
    </Modal>
  );
}
