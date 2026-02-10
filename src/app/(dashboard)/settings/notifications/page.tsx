"use client";

import { useState, useEffect } from "react";

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState({
    alertDaysBefore: 3,
    emailNotification: false,
    showAllBusinesses: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/notifications?settings=true")
      .then((r) => r.json())
      .then((json) => {
        const s = json.data || json;
        if (s.alertDaysBefore !== undefined) setSettings(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateSettings: true, ...settings }),
      });
      if (res.ok) setMessage("保存しました");
      else setMessage("保存に失敗しました");
    } catch {
      setMessage("エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">通知設定</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            アラート表示（何日前から）
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={settings.alertDaysBefore}
              onChange={(e) =>
                setSettings({ ...settings, alertDaysBefore: parseInt(e.target.value) || 3 })
              }
              className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <span className="text-sm text-gray-600">日前から期限アラートを表示</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">メール通知</p>
            <p className="text-xs text-gray-500">期限超過時にメールで通知を受け取る</p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, emailNotification: !settings.emailNotification })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.emailNotification ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.emailNotification ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">全事業のアラートを表示</p>
            <p className="text-xs text-gray-500">
              OFFの場合、自分が担当する顧客のアラートのみ表示
            </p>
          </div>
          <button
            onClick={() =>
              setSettings({ ...settings, showAllBusinesses: !settings.showAllBusinesses })
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.showAllBusinesses ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.showAllBusinesses ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
          {message && (
            <span className={`ml-3 text-sm ${message.includes("失敗") || message.includes("エラー") ? "text-red-600" : "text-green-600"}`}>
              {message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
