import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PredictionsDashboard from "../predictions/PredictionsDashboard";
import {
    isAdminAuthenticated,
    isAdminConfigured,
    isLocalAdminBypass,
} from "../util/admin/adminAuth";
import { listAllReportDates, loadModelDiagnostics, loadOperationalStatus } from "../util/data/predictionService";
import { loginAdmin, logoutAdmin } from "./actions";
import SystemStatusPanel from "./SystemStatusPanel";

export const metadata: Metadata = {
    title: "Admin Dashboard",
    robots: {
        index: false,
        follow: false,
    },
};

export const dynamic = "force-dynamic";

interface PageProps {
    searchParams: Promise<{ date?: string; error?: string }>;
}

function AdminLogin({ failed }: { failed: boolean }) {
    return (
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-12">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm shadow-slate-900/5 dark:border-gray-800 dark:bg-gray-900/70 dark:shadow-black/10">
                <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">SportWebApp</p>
                    <h1 className="mt-2 text-3xl font-black text-gray-900 dark:text-white">Admin dashboard</h1>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Model diagnostics and operational panels are separated from the public prediction view.
                    </p>
                </div>

                <form action={loginAdmin} className="space-y-4">
                    <div>
                        <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Admin password
                        </label>
                        <input
                            id="admin-password"
                            name="password"
                            type="password"
                            required
                            autoComplete="current-password"
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                        />
                    </div>

                    {failed && (
                        <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm font-semibold text-rose-500 dark:text-rose-300">
                            Incorrect admin password.
                        </p>
                    )}

                    <button
                        type="submit"
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                        Sign in
                    </button>
                </form>
            </div>
        </div>
    );
}

function AdminBar({ localBypass }: { localBypass: boolean }) {
    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-3 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-500">Admin</p>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Model operations</h1>
            </div>

            <div className="flex items-center gap-3">
                {localBypass && (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-600 dark:text-amber-300">
                        Local dev access
                    </span>
                )}
                {!localBypass && (
                    <form action={logoutAdmin}>
                        <button
                            type="submit"
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Sign out
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default async function AdminPage({ searchParams }: PageProps) {
    const params = await searchParams;

    if (!isAdminConfigured() && process.env.NODE_ENV === "production") {
        notFound();
    }

    const authenticated = await isAdminAuthenticated();

    if (!authenticated) {
        return <AdminLogin failed={params.error === "1"} />;
    }

    const reportDates = listAllReportDates();
    const diagnostics = loadModelDiagnostics();
    const operationalStatus = loadOperationalStatus();

    return (
        <>
            <AdminBar localBypass={isLocalAdminBypass()} />
            <SystemStatusPanel
                status={operationalStatus}
                reportDates={reportDates}
                diagnostics={diagnostics}
            />
            <PredictionsDashboard
                searchParams={params}
                basePath="/admin"
                showDiagnostics
            />
        </>
    );
}
