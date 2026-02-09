"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface SharedPageData {
  id: string;
  type: string;
  title: string;
  content: string;
  publishedAt: string;
  comments?: CommentData[];
}

interface CommentData {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface PortalData {
  customerName: string;
  businessName: string;
  pages: SharedPageData[];
}

const TYPE_LABELS: Record<string, string> = {
  MEETING_NOTE: "議事録",
  PROGRESS: "進捗共有",
  REPORT: "レポート",
  DOCUMENT: "ドキュメント",
  CUSTOM: "その他",
};

export default function SharedPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [selectedPage, setSelectedPage] = useState<SharedPageData | null>(null);
  const [commentName, setCommentName] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchData = async (code?: string) => {
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (code) headers["X-Passcode"] = code;

      const res = await fetch(`/api/shared/${token}`, { headers });

      if (res.status === 401) {
        setNeedsPasscode(true);
        setLoading(false);
        return;
      }

      if (res.status === 404 || res.status === 410) {
        setError("このリンクは無効か、有効期限が切れています。");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("データの取得に失敗しました。");
        setLoading(false);
        return;
      }

      const json = await res.json();
      setData(json);
      setNeedsPasscode(false);
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(passcode);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPage || !commentName.trim() || !commentContent.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/shared/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedPageId: selectedPage.id,
          authorName: commentName.trim(),
          content: commentContent.trim(),
        }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setSelectedPage({
          ...selectedPage,
          comments: [...(selectedPage.comments || []), newComment],
        });
        setCommentContent("");
      }
    } catch {
      // ignore
    } finally {
      setSubmittingComment(false);
    }
  };

  // Passcode screen
  if (needsPasscode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
          <h2 className="text-lg font-bold text-gray-900 mb-4 text-center">パスコードが必要です</h2>
          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="パスコードを入力"
              className="w-full px-4 py-3 border border-gray-300 rounded-md text-center text-lg"
              autoFocus
            />
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              送信
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Error screen
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  // Page detail view
  if (selectedPage) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b px-6 py-4">
          <button
            onClick={() => setSelectedPage(null)}
            className="text-sm text-blue-600 hover:underline mb-2 block"
          >
            ← 一覧に戻る
          </button>
          <h1 className="text-xl font-bold text-gray-900">{selectedPage.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
              {TYPE_LABELS[selectedPage.type] || selectedPage.type}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(selectedPage.publishedAt).toLocaleDateString("ja-JP")}
            </span>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
              {selectedPage.content}
            </div>
          </div>

          {/* Comments */}
          <div className="mt-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">コメント</h3>

            {(selectedPage.comments || []).length > 0 ? (
              <div className="space-y-3 mb-6">
                {selectedPage.comments!.map((c) => (
                  <div key={c.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm text-gray-900">{c.authorName}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString("ja-JP")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-6">まだコメントはありません</p>
            )}

            <form onSubmit={handleCommentSubmit} className="bg-white rounded-lg shadow p-4 space-y-3">
              <input
                type="text"
                value={commentName}
                onChange={(e) => setCommentName(e.target.value)}
                placeholder="お名前"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                required
              />
              <textarea
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="コメントを入力..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                required
              />
              <button
                type="submit"
                disabled={submittingComment}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {submittingComment ? "送信中..." : "コメント送信"}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // Portal list view
  const groupedPages: Record<string, SharedPageData[]> = {};
  data.pages.forEach((page) => {
    const type = page.type || "CUSTOM";
    if (!groupedPages[type]) groupedPages[type] = [];
    groupedPages[type].push(page);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-6">
        <h1 className="text-xl font-bold text-gray-900">{data.customerName}</h1>
        <p className="text-sm text-gray-500 mt-1">{data.businessName} - 共有ドキュメント</p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {Object.keys(groupedPages).length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">共有ドキュメントはまだありません</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedPages).map(([type, pages]) => (
              <div key={type}>
                <h2 className="text-lg font-bold text-gray-800 mb-3">
                  {TYPE_LABELS[type] || type}
                </h2>
                <div className="space-y-2">
                  {pages.map((page) => {
                    const isNew =
                      new Date(page.publishedAt).getTime() >
                      Date.now() - 7 * 86400000;
                    return (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPage(page)}
                        className="w-full bg-white rounded-lg shadow p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{page.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(page.publishedAt).toLocaleDateString("ja-JP")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isNew && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                              NEW
                            </span>
                          )}
                          <span className="text-gray-400">→</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t bg-white px-6 py-4 mt-12">
        <p className="text-xs text-gray-400 text-center">Powered by 業務管理システム</p>
      </footer>
    </div>
  );
}
