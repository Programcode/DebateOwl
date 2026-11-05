import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";
import Pricing from "@/components/landing/Pricing";
import ShortAnswer from "@/components/landing/ShortAnswer";
import GuideHub from "@/components/landing/GuideHub";
import { usePageHead } from "@/lib/seo/use-page-head";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/SkipLink";
import { DailyMotionCard } from "@/components/daily-motion/DailyMotion";
import { useRouteLanguage } from "@/lib/seo/localized-routes";

const LandingPage = () => {
    usePageHead("/");
    const language = useRouteLanguage();
    return (
        <div className="min-h-screen overflow-x-hidden bg-background">
            <SkipLink />
            <header>
                <Navbar />
            </header>
            <main id={MAIN_CONTENT_ID} className="focus-visible:outline-hidden">
                <Hero />
                <ShortAnswer />
                {/* The Daily Motion pages are in English, so only the English landing page shows today's. */}
                {language === "en" && (
                    <div className="section-container max-w-3xl pb-8 md:pb-16">
                        <DailyMotionCard />
                    </div>
                )}
                <Features />
                <HowItWorks />
                <Pricing />
                <GuideHub />
                <FAQ />
                <FinalCTA />
            </main>
            <Footer />
        </div>
    );
};

export default LandingPage;
