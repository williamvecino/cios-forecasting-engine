import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import ForecastsPage from "@/pages/forecasts/index";
import LibraryPage from "@/pages/library/index";
import SystemPage from "@/pages/system/index";
import Dashboard from "@/pages/dashboard";
import CasesList from "@/pages/cases/index";
import CaseLibrary from "@/pages/case-library/index";
import Calibration from "@/pages/calibration/index";
import FieldIntelligence from "@/pages/field-intelligence/index";
import Watchlist from "@/pages/watchlist/index";
import AdopterDiscovery from "@/pages/discovery/index";
import SignalReview from "@/pages/review/index";
import SignalDetection from "@/pages/signal-detection/index";
import EventRadar from "@/pages/event-radar/index";
import SystemMap from "@/pages/system-map/index";
import CIOSWorkbench from "@/pages/workbench/index";
import StabilityTests from "@/pages/stability-tests/index";
import QuestionPage from "@/pages/question/index";
import SignalsPage from "@/pages/signals/index";
import ForecastPage from "@/pages/forecast/index";
import RespondPage from "@/pages/respond/index";
import SimulatePage from "@/pages/simulate/index";
import SimulationEnginePage from "@/pages/simulate/simulation-engine";
import ComparisonGroupsPage from "@/pages/comparison-groups/index";
import ForecastLedgerPage from "@/pages/forecast-ledger/index";
import ReferenceCasesPage from "@/pages/reference-cases/index";
import AdoptionSegmentsPage from "@/pages/adoption-segments/index";
import BarrierDiagnosisPage from "@/pages/barrier-diagnosis/index";
import CaseFeedbackPage from "@/pages/case-feedback/index";
import ReadinessTimelinePage from "@/pages/readiness-timeline/index";
import CompetitiveRiskPage from "@/pages/competitive-risk/index";
import GrowthFeasibilityPage from "@/pages/growth-feasibility/index";
import CaseWorkflowRedirect from "@/components/case-workflow-redirect";
import CaseInputPage from "@/pages/case-input/index";
import IngestPage from "@/pages/ingest/index";
import InterpretPage from "@/pages/interpret/index";
import GoldSetPage from "@/pages/gold-set/index";
import AgentRegistryPage from "@/pages/agent-registry/index";
import NotFound from "@/pages/not-found";
import { useRoute, useLocation } from "wouter";
import { useEffect, useState } from "react";

function LegacyCaseRedirect() {
  const [, params] = useRoute("/cases/:caseId");
  const [, navigate] = useLocation();
  useEffect(() => {
    if (params?.caseId) navigate(`/case/${params.caseId}/question`, { replace: true });
  }, [params?.caseId, navigate]);
  return null;
}

function QuestionPageFresh() {
  const [key, setKey] = useState(() => Date.now());
  const [location] = useLocation();
  useEffect(() => {
    if (location === "/question") {
      setKey(Date.now());
    }
  }, [location]);
  return <QuestionPage key={key} />;
}

function HomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    let target = "/question";
    try {
      const saved = localStorage.getItem("cios.lastPath");
      if (saved && saved !== "/") target = saved;
    } catch {}
    navigate(target, { replace: true });
  }, [navigate]);
  return null;
}

function usePathTracker() {
  const [location] = useLocation();
  useEffect(() => {
    if (location && location !== "/") {
      try { localStorage.setItem("cios.lastPath", location); } catch {}
    }
  }, [location]);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function Router() {
  usePathTracker();
  return (
    <Switch>
      <Route path="/">{() => <HomeRedirect />}</Route>
      <Route path="/forecasts" component={ForecastsPage} />
      <Route path="/library" component={LibraryPage} />
      <Route path="/system" component={SystemPage} />

      <Route path="/question"><QuestionPageFresh /></Route>
      <Route path="/comparison-groups" component={ComparisonGroupsPage} />
      <Route path="/signals" component={SignalsPage} />
      <Route path="/forecast" component={ForecastPage} />
      <Route path="/decide"><Redirect to="/respond" /></Route>
      <Route path="/respond" component={RespondPage} />
      <Route path="/simulate" component={SimulatePage} />
      <Route path="/simulation-engine" component={SimulationEnginePage} />

      <Route path="/dashboard" component={Dashboard} />
      <Route path="/cases" component={CasesList} />

      <Route path="/case/:caseId/question">{() => <CaseWorkflowRedirect targetStep="question" />}</Route>
      <Route path="/case/:caseId/signals">{() => <CaseWorkflowRedirect targetStep="signals" />}</Route>
      <Route path="/case/:caseId/pending-signals">{() => <CaseWorkflowRedirect targetStep="signals" />}</Route>
      <Route path="/case/:caseId/forecast">{() => <CaseWorkflowRedirect targetStep="forecast" />}</Route>
      <Route path="/case/:caseId/scenario">{() => <CaseWorkflowRedirect targetStep="forecast" />}</Route>
      <Route path="/case/:caseId/ledger">{() => <CaseWorkflowRedirect targetStep="forecast" />}</Route>
      <Route path="/case/:caseId/agents/detection">{() => <CaseWorkflowRedirect targetStep="signals" />}</Route>
      <Route path="/case/:caseId/agents/hygiene">{() => <CaseWorkflowRedirect targetStep="signals" />}</Route>
      <Route path="/case/:caseId/agents/refinement">{() => <CaseWorkflowRedirect targetStep="question" />}</Route>
      <Route path="/case/:caseId/agents/message">{() => <CaseWorkflowRedirect targetStep="signals" />}</Route>
      <Route path="/case/:caseId/discover">{() => <CaseWorkflowRedirect targetStep="signals" />}</Route>
      <Route path="/case/:caseId/analogs">{() => <CaseWorkflowRedirect targetStep="forecast" />}</Route>
      <Route path="/case/:caseId/portfolio">{() => <CaseWorkflowRedirect targetStep="respond" />}</Route>
      <Route path="/case/:caseId/respond">{() => <CaseWorkflowRedirect targetStep="respond" />}</Route>
      <Route path="/case/:caseId/simulate">{() => <CaseWorkflowRedirect targetStep="simulate" />}</Route>
      <Route path="/case/:caseId/:rest*">{() => <CaseWorkflowRedirect targetStep="question" />}</Route>

      <Route path="/case-library" component={CaseLibrary} />
      <Route path="/forecast-ledger" component={ForecastLedgerPage} />
      <Route path="/reference-cases" component={ReferenceCasesPage} />
      <Route path="/adoption-segments" component={AdoptionSegmentsPage} />
      <Route path="/barrier-diagnosis" component={BarrierDiagnosisPage} />
      <Route path="/case-feedback" component={CaseFeedbackPage} />
      <Route path="/readiness-timeline" component={ReadinessTimelinePage} />
      <Route path="/competitive-risk" component={CompetitiveRiskPage} />
      <Route path="/growth-feasibility" component={GrowthFeasibilityPage} />
      <Route path="/calibration" component={Calibration} />
      <Route path="/field-intelligence" component={FieldIntelligence} />
      <Route path="/watchlist" component={Watchlist} />
      <Route path="/discovery" component={AdopterDiscovery} />
      <Route path="/review" component={SignalReview} />
      <Route path="/signal-detection" component={SignalDetection} />
      <Route path="/event-radar" component={EventRadar} />
      <Route path="/system-map" component={SystemMap} />
      <Route path="/workbench" component={CIOSWorkbench} />
      <Route path="/case-input" component={CaseInputPage} />
      <Route path="/ingest" component={IngestPage} />
      <Route path="/interpret" component={InterpretPage} />
      <Route path="/stability-tests" component={StabilityTests} />
      <Route path="/gold-set" component={GoldSetPage} />
      <Route path="/agent-registry" component={AgentRegistryPage} />
      <Route path="/cases/:caseId" component={LegacyCaseRedirect} />
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
