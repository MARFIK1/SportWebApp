import type { Metadata } from "next";
import PredictionsDashboard from "./PredictionsDashboard";

export const metadata: Metadata = {
    title: "Predictions Dashboard",
    description: "Machine learning prediction dashboard with per-model accuracy tracking and consensus voting across 9 classifiers",
};

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

export default async function Predictions({ searchParams }: PageProps) {
    return (
        <PredictionsDashboard
            searchParams={await searchParams}
            basePath="/predictions"
        />
    );
}
