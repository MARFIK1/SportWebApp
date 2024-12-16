"use client";
import { useState } from "react";

interface ResetPasswordFormProps {
    onSwitchView: (view: "login" | "register" | "reset") => void;
}

export default function ResetPasswordForm({ onSwitchView } : ResetPasswordFormProps) {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleResetPassword = async () => {
        setMessage(null);
        setError(null);

        const response = await fetch('/api/auth/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        if (response.ok) {
            setMessage('Password reset email has been sent.');
        }
        else {
            const data = await response.json();
            setError(data.error || 'Password reset failed.');
        }
    }

    return (
        <div>
            <h2 className="text-2xl font-bold">
                Reset Password
            </h2>
            {message && <p className="text-green-500 mb-4">{message}</p>}
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email
                </label>
                <input
                    type="email"
                    id="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border rounded text-black my-2"
                    required
                />
            </div>
            <button
                onClick={handleResetPassword}
                className="w-full bg-blue-500 text-white py-2 rounded"
            >
                Send reset link
            </button>
            <div className="text-sm text-center mt-2">
                <button
                    type="button"
                    onClick={() => onSwitchView('login')}
                    className="text-blue-500"
                >
                    Back to login
                </button>
            </div>
        </div>
    )
}