"use client";

import { createContext, useContext, useState } from "react";
import type {
    ConsensusPrediction,
    ModelPrediction,
    PredictionMatch,
    PredictionVariant,
    PredictionVariantKey,
} from "@/types/predictions";

interface ActivePredictionBundle {
    consensus?: ConsensusPrediction;
    marketPredictions?: PredictionMatch["market_predictions"] | PredictionVariant["market_predictions"];
    models: [string, ModelPrediction][];
    oddsUsed: boolean;
    skippedTargets: string[];
}

interface MatchPredictionVariantContextValue {
    availableVariants: PredictionVariantKey[];
    activeVariant: PredictionVariantKey;
    canSwitchVariants: boolean;
    setActiveVariant: (variant: PredictionVariantKey) => void;
    bundle: ActivePredictionBundle;
    matchFinished: boolean;
}

const MatchPredictionVariantContext = createContext<MatchPredictionVariantContextValue | null>(null);

function hasVariant(match: PredictionMatch, variant: PredictionVariantKey): boolean {
    return Boolean(match.prediction_variants?.[variant]);
}

function getAvailableVariants(match: PredictionMatch): PredictionVariantKey[] {
    const variants: PredictionVariantKey[] = [];

    if (hasVariant(match, "without_odds")) variants.push("without_odds");
    if (hasVariant(match, "with_odds")) variants.push("with_odds");

    return variants;
}

function getInitialVariant(match: PredictionMatch): PredictionVariantKey {
    if (match.default_prediction_variant && hasVariant(match, match.default_prediction_variant)) {
        return match.default_prediction_variant;
    }
    if (hasVariant(match, "without_odds")) return "without_odds";
    if (hasVariant(match, "with_odds")) return "with_odds";
    return "without_odds";
}

function getBundle(match: PredictionMatch, activeVariant: PredictionVariantKey): ActivePredictionBundle {
    const selectedVariant = match.prediction_variants?.[activeVariant];

    if (selectedVariant) {
        return {
            consensus: selectedVariant.consensus,
            marketPredictions: selectedVariant.market_predictions,
            models: Object.entries(selectedVariant.predictions) as [string, ModelPrediction][],
            oddsUsed: selectedVariant.odds_used,
            skippedTargets: selectedVariant.skipped_targets ?? [],
        };
    }

    return {
        consensus: match.predictions.consensus,
        marketPredictions: match.market_predictions,
        models: Object.entries(match.predictions).filter(([key]) => key !== "consensus") as [string, ModelPrediction][],
        oddsUsed: false,
        skippedTargets: [],
    };
}

export function useMatchPredictionVariant() {
    const context = useContext(MatchPredictionVariantContext);
    if (!context) {
        throw new Error("useMatchPredictionVariant must be used within MatchPredictionVariantProvider");
    }
    return context;
}

export default function MatchPredictionVariantProvider({
    children,
    match,
    matchFinished,
}: {
    children: React.ReactNode;
    match: PredictionMatch;
    matchFinished: boolean;
}) {
    const availableVariants = getAvailableVariants(match);
    const [activeVariant, setActiveVariant] = useState<PredictionVariantKey>(getInitialVariant(match));

    const bundle = getBundle(match, activeVariant);

    return (
        <MatchPredictionVariantContext.Provider
            value={{
                availableVariants,
                activeVariant,
                canSwitchVariants: availableVariants.length > 1,
                setActiveVariant,
                bundle,
                matchFinished,
            }}
        >
            {children}
        </MatchPredictionVariantContext.Provider>
    );
}
