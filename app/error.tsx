"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex flex-col w-full justify-center items-center min-h-[60vh] gap-4 px-6 text-center">
            <div className="text-5xl">!</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Something went wrong</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">{error.message || "An unexpected error occurred"}</p>
            <button
                onClick={reset}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
                Try again
            </button>
        </div>
    );
}
