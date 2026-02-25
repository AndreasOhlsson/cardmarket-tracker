import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "@/components/layout";
import DealsPage from "@/pages/deals";
import WatchlistPage from "@/pages/watchlist";
import CardDetailPage from "@/pages/card-detail";
import StatsPage from "@/pages/stats";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DealsPage /> },
      { path: "/watchlist", element: <WatchlistPage /> },
      { path: "/card/:uuid", element: <CardDetailPage /> },
      { path: "/stats", element: <StatsPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
