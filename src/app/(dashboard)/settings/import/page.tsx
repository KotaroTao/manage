"use client";

import { useState, useRef } from "react";

type ImportType = "customers" | "partners";
type PreviewRow = Record<string, string>;

export default function ImportPage() {
  const [importType, setImportType] = useState<ImportType>("customers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldMaps: Record<ImportType, { key: string; label: string }[]> = {
    customers: [
      { key: "name", label: "顧客名" },
      { key: "company", label: "会社名" },
      { key: "email", label: "メール" },
      { key: "phone", label: "電話番号" },
      { key: "address", label: "住所" },
      { key: "representative", label: "担当者名" },
    ],
    partners: [
      { key: "name", label: "パートナー名" },
      { key: "company", label: "会社名" },
      { key: "email", label: "メール" },
      { key: "phone", label: "電話番号" },
      { key: "specialty", label: "専門分野" },
      { key: "contractType", label: "契約形態" },
      { key: "rate", label: "単価" },
    ],
  };

  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return;
    const h = parseCSVLine(lines[0]);
    setHeaders(h);
    const rows = lines.slice(1, 6).map((line) => {
      const cells = parseCSVLine(line);
      const row: PreviewRow = {};
      h.forEach((header, i) => { row[header] = cells[i] || ""; });
      return row;
    });
    setPreview(rows);
    // Auto-map columns
    const autoMap: Record<string, string> = {};
    const fields = fieldMaps[importType];
    h.forEach((header) => {
      const match = fields.find(
        (f) => f.label === header || f.key === header.toLowerCase()
      );
      if (match) autoMap[header] = match.key;
    });
    setColumnMapping(autoMap);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      parseCSV(ev.target?.result as string);
    };
    reader.readAsText(f, "UTF-8");
  };

  const handleImport = async () => {
    if (!file || preview.length === 0) return;
    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      const csvHeaders = parseCSVLine(lines[0]);

      const records = lines.slice(1).map((line) => {
        const cells = parseCSVLine(line);
        const record: Record<string, string> = {};
        csvHeaders.forEach((h, i) => {
          const mappedField = columnMapping[h];
          if (mappedField) record[mappedField] = cells[i] || "";
        });
        return record;
      });

      const endpoint = importType === "customers" ? "/api/customers" : "/api/partners";
      let success = 0;
      const errors: string[] = [];

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!record.name) {
          errors.push(`行 ${i + 2}: 名前が空です`);
          continue;
        }
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
          });
          if (res.ok) success++;
          else errors.push(`行 ${i + 2}: ${(await res.json()).error || "登録失敗"}`);
        } catch {
          errors.push(`行 ${i + 2}: ネットワークエラー`);
        }
      }

      setResult({ success, errors });
    } catch {
      setResult({ success: 0, errors: ["ファイルの読み込みに失敗しました"] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">データインポート</h1>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Import Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">インポート種別</label>
          <select
            value={importType}
            onChange={(e) => { setImportType(e.target.value as ImportType); setFile(null); setPreview([]); setResult(null); }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="customers">顧客マスタ</option>
            <option value="partners">パートナー</option>
          </select>
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">CSVファイル</label>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
          >
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            {file ? (
              <p className="text-sm text-gray-700">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            ) : (
              <div>
                <p className="text-gray-500 mb-1">クリックしてCSVファイルを選択</p>
                <p className="text-xs text-gray-400">UTF-8エンコード、1行目がヘッダー</p>
              </div>
            )}
          </div>
        </div>

        {/* Column Mapping */}
        {headers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">カラムマッピング</label>
            <div className="space-y-2">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-gray-600 truncate">{h}</span>
                  <span className="text-gray-400">→</span>
                  <select
                    value={columnMapping[h] || ""}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [h]: e.target.value })}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="">-- スキップ --</option>
                    {fieldMaps[importType].map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              プレビュー（先頭5件）
            </label>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border">
                <thead>
                  <tr className="bg-gray-50">
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1 border text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1 border">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Button */}
        {file && headers.length > 0 && (
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? "インポート中..." : "インポート実行"}
          </button>
        )}

        {/* Result */}
        {result && (
          <div className={`p-4 rounded-md ${result.errors.length > 0 ? "bg-yellow-50" : "bg-green-50"}`}>
            <p className="text-sm font-medium text-green-800">
              成功: {result.success}件
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-red-800">エラー: {result.errors.length}件</p>
                <ul className="mt-1 text-xs text-red-700 space-y-1">
                  {result.errors.slice(0, 20).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.errors.length > 20 && (
                    <li>... 他 {result.errors.length - 20}件</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
