import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const SourceReview = lazy(() => import("./pages/SourceReview"));

function RouteLoading() {
  return <main className="grid min-h-screen place-items-center bg-[#090a0a] px-5 text-[#e4e4e7]"><div className="border border-[#a3e635]/25 bg-black/25 px-4 py-3 text-center"><div className="numeric text-[10px] tracking-[.16em] text-[#a3e635]">LOADING CHRONOMESH MODULE</div><div className="mt-1 text-xs text-[#71717a]">The requested dashboard view is being prepared.</div></div></main>;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/leaderboard"} component={Leaderboard} />
      <Route path={"/source-review"} component={SourceReview} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<RouteLoading />}><Router /></Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
