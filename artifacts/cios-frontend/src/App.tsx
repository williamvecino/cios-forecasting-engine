import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Dashboard from "@/pages/dashboard";
import CasesList from "@/pages/cases/index";
import QuestionDetail from "@/pages/cases/detail";
import SignalsRegister from "@/pages/cases/signals";
import SignalDiscover from "@/pages/cases/discover";
import ForecastResults from "@/pages/cases/forecast";
import AnalogRetrieval from "@/pages/cases/analogs";
import AgentSimulation from "@/pages/cases/agents";
import Portfolio from "@/pages/cases/portfolio";
import CaseLibrary from "@/pages/case-library/index";
import Calibration from "@/pages/calibration/index";
import FieldIntelligence from "@/pages/field-intelligence/index";
import Watchlist from "@/pages/watchlist/index";
import AdopterDiscovery from "@/pages/discovery/index";
import SignalReview from "@/pages/review/index";
import SignalDetection from "@/pages/signal-detection/index";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/cases" component={CasesList} />
      <Route path="/cases/:caseId/signals" component={SignalsRegister} />
      <Route path="/cases/:caseId/discover" component={SignalDiscover} />
      <Route path="/cases/:caseId/forecast" component={ForecastResults} />
      <Route path="/cases/:caseId/analogs" component={AnalogRetrieval} />
      <Route path="/cases/:caseId/agents" component={AgentSimulation} />
      <Route path="/cases/:caseId/portfolio" component={Portfolio} />
      <Route path="/cases/:caseId" component={QuestionDetail} />
      <Route path="/case-library" component={CaseLibrary} />
      <Route path="/calibration" component={Calibration} />
      <Route path="/field-intelligence" component={FieldIntelligence} />
      <Route path="/watchlist" component={Watchlist} />
      <Route path="/discovery" component={AdopterDiscovery} />
      <Route path="/review" component={SignalReview} />
      <Route path="/signal-detection" component={SignalDetection} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
