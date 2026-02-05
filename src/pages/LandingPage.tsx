import {
    Navbar,
    Hero,
    SocialProof,
    Features,
    HowItWorks,
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
            <HowItWorks />
            <FinalCTA />
            <Footer />
        </div>
    );
};

export default LandingPage;
