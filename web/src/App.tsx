import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

const DealsPage = lazy(() => import("@/pages/deals"));
const WatchlistPage = lazy(() => import("@/pages/watchlist"));
const CardDetailPage = lazy(() => import("@/pages/card-detail"));
const StatsPage = lazy(() => import("@/pages/stats"));

/* ── Per-page skeleton fallbacks matching actual page layouts ── */

function DealsFallback() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="flex gap-3 mb-6 flex-wrap">
        <Skeleton className="h-9 w-44 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-44 rounded-md" />
      </div>
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function WatchlistFallback() {
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-full sm:w-64 rounded-md" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/30 h-10" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 h-20 border-b border-border/30">
            <Skeleton className="w-14 h-19 rounded-sm shrink-0" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-10 ml-auto" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardDetailFallback() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-6 md:gap-8 mb-8">
        <Skeleton className="w-44 sm:w-56 h-[308px] sm:h-[388px] rounded-lg shrink-0 mx-auto sm:mx-0" />
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <Skeleton className="h-4 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-lg border border-border p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function StatsFallback() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-24 mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border">
            <div className="p-6 pb-2">
              <Skeleton className="h-5 w-36" />
            </div>
            <div className="p-6 pt-2 space-y-3">
              {Array.from({ length: 5 }, (_, j) => (
                <div key={j} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-14 rounded-sm" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Suspense fallback={<DealsFallback />}><DealsPage /></Suspense> },
      { path: "/watchlist", element: <Suspense fallback={<WatchlistFallback />}><WatchlistPage /></Suspense> },
      { path: "/card/:uuid", element: <Suspense fallback={<CardDetailFallback />}><CardDetailPage /></Suspense> },
      { path: "/stats", element: <Suspense fallback={<StatsFallback />}><StatsPage /></Suspense> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
