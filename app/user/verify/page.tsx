"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("token");
        if (!token) {
            setMessage("Verification token is missing.");
            return;
        }

        const verifyEmail = async () => {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })

            if (response.ok) {
                setMessage("Your account has been successfully verified!");
                setTimeout(() => router.push("/user/login"), 3000);
            }
            else {
                const data = await response.json();
                setMessage(data.error || "Verification failed.");
            }
        }

        verifyEmail();
    }, [])

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-800">
            <div className="p-6 bg-white rounded shadow-lg">
                <h1 className="text-xl font-bold text-center mb-4">
                    Email Verification
                </h1>
                {
                    message ? (
                        <p className={`text-center ${message.includes("successfully") ? "text-green-500" : "text-red-500"}`}>
                            {message}
                        </p>
                    ) : (
                        <p className="text-center text-gray-500">
                            Verifying...
                        </p>
                    )
                }
                <button
                    onClick={() => router.push("/")}
                    className="mt-4 w-full bg-blue-500 text-white py-2 rounded"
                >
                    Back to Home
                </button>
            </div>
        </div>
    )
}