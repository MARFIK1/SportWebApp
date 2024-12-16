"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [newPassword, setNewPassword] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = searchParams.get("token");
        if (!token) {
            setMessage("Reset token is required.");
            return;
        }

        const response = await fetch('/api/auth/reset/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        })

        if (response.ok) {
            setMessage("Password has been successfully reset! You can now log in.");
            setTimeout(() => router.push("/user/login"), 3000);
        }
        else {
            const data = await response.json();
            setMessage(data.error || "Password reset failed.");
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-800">
            <div className="p-6 bg-white rounded shadow-lg">
                <h1 className="text-xl font-bold text-center mb-4">
                    Reset Password
                </h1>
                {
                    message ? (
                        <p className={`text-center ${message.includes('successfully') ? "text-green-500" : "text-red-500"}`}>
                            {message}
                        </p>
                    ) : (
                        <form 
                            onSubmit={handleSubmit}
                            className="space-y-4"
                        >
                            <input
                                type="password"
                                placeholder="New password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-4 py-2 border rounded"
                                required
                            />
                            <button
                                type="submit"
                                className="w-full bg-blue-500 text-white py-2 rounded"
                            >
                                Reset Password
                            </button>
                        </form>
                    )
                }
            </div>
        </div>
    )
}