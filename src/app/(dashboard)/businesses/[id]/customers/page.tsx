'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * /businesses/[id]/customers -> redirects to /businesses/[id] (customers tab)
 */
export default function BusinessCustomersRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = params.id as string;

  useEffect(() => {
    router.replace(`/businesses/${businessId}`);
  }, [router, businessId]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">リダイレクト中...</span>
        </div>
      </div>
    </div>
  );
}
