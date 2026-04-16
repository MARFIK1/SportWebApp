export default function LoadingComponent() {
    return (
        <div className="flex flex-col items-center gap-4" role="status" aria-label="Loading">
            <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
            <span className="sr-only">Loading</span>
        </div>
    );
}
