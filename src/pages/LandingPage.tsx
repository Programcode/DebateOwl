import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import DeepDive from "@/components/landing/DeepDive";
import UseCases from "@/components/landing/UseCases";
import HowItWorks from "@/components/landing/HowItWorks";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import WhatsNew from "@/components/landing/WhatsNew";
import Pricing from "@/components/landing/Pricing";

const LandingPage = () => {
    return (
        <div className="min-h-screen overflow-x-hidden bg-background">
            <Navbar />
            <main>
                <Hero />
                <WhatsNew />
                <Features />
                <Pricing />
                <DeepDive />
                <HowItWorks />
                <UseCases />
                <FAQ />
                <FinalCTA />
            </main>
            <Footer />
        </div>
    );
};

export default LandingPage;
