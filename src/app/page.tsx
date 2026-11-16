import AiSearch from "@/components/home/AiSearch";
import AnnouncementBar from "@/components/home/AnnouncementBar";
import Approvals from "@/components/home/Approvals";
import Automation from "@/components/home/Automation";
import Faq from "@/components/home/Faq";
import FinalCta from "@/components/home/FinalCta";
import Footer from "@/components/home/Footer";
import FreeAudit from "@/components/home/FreeAudit";
import Header from "@/components/home/Header";
import Hero from "@/components/home/Hero";
import HowItWorks from "@/components/home/HowItWorks";
import Integrations from "@/components/home/Integrations";
import Issues from "@/components/home/Issues";
import Outcomes from "@/components/home/Outcomes";
import Pricing from "@/components/home/Pricing";
import Problem from "@/components/home/Problem";
import Reports from "@/components/home/Reports";
import StickyCta from "@/components/home/StickyCta";
import Team from "@/components/home/Team";

export default function HomePage() {
  return (
    <div
      className="home"
      style={{
        fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
        background: "#F6F4EF",
        color: "#0F1B2D",
        boxSizing: "border-box",
      }}
    >
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
        <Integrations />
        <Problem />
        <FreeAudit />
        <Outcomes />
        <HowItWorks />
        <Approvals />
        <Issues />
        <AiSearch />
        <Reports />
        <Team />
        <Automation />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <StickyCta />
    </div>
  );
}
