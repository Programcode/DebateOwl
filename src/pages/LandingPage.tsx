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
} from "@/components/landing";

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            <Navbar />
            <Hero />
            <SocialProof />
            <Features />
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
