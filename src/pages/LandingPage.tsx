import {
    Navbar,
    Hero,
    SocialProof,
    Features,
    DeepDive,
    UseCases,
    HowItWorks,
    FAQ,
    FinalCTA,
    Footer,
    WhatsNew,
    Pricing,
} from "@/components/landing";

const LandingPage = () => {
    return (
        <div className="min-h-screen overflow-x-hidden bg-background">
            <Navbar />
            <Hero />
            <SocialProof />
            <WhatsNew />
            <Features />
            <Pricing />
            <DeepDive />
            <HowItWorks />
            <UseCases />
            <FAQ />
            <FinalCTA />
            <Footer />
        </div>
    );
};

export default LandingPage;
