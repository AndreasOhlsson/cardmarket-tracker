import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

const DealsPage = lazy(() => import("@/pages/deals"));
const WatchlistPage = lazy(() => import("@/pages/watchlist"));
const CardDetailPage = lazy(() => import("@/pages/card-detail"));
const StatsPage = lazy(() => import("@/pages/stats"));

function PageFallback() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64" />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Suspense fallback={<PageFallback />}><DealsPage /></Suspense> },
      { path: "/watchlist", element: <Suspense fallback={<PageFallback />}><WatchlistPage /></Suspense> },
      { path: "/card/:uuid", element: <Suspense fallback={<PageFallback />}><CardDetailPage /></Suspense> },
      { path: "/stats", element: <Suspense fallback={<PageFallback />}><StatsPage /></Suspense> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
