"use client";
import { useState } from "react";

interface RegisterFormProps {
    onSwitchView: (view: "login" | "register" | "reset") => void;
}

export default function RegisterForm({ onSwitchView } : RegisterFormProps) {
    const [nickname, setNickname] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const handleRegister = async () => {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, email, password })
        });

        if (response.ok) {
            setMessage("Registration successful! Check your email to verify your account.");
        }
        else {
            setMessage("Registration failed.");
        }
    }

    return (
        <div>
            <h2 className="text-2xl font-bold">
                Register
            </h2>
            {
                message && (
                    <p className={`text-sm mb-4 ${message.includes('successful') ? 'text-green-500' : 'text-red-500'}`}>
                        {message}
                    </p>
                )
            }
            <div>
                <label htmlFor="nickname" className="block text-sm font-medium text-gray-700">
                    Nickname
                </label>
                <input
                    type="text"
                    id="nickname"
                    placeholder="Enter your nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-4 py-2 border rounded text-black my-2"
                    required
                />
            </div>
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
            <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                </label>
                <input
                    type="password"
                    id="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border rounded text-black my-2"
                    required
                />
            </div>
            <button
                onClick={handleRegister}
                className="w-full bg-green-500 text-white py-2 rounded"
            >
                Register
            </button>
            <div className="text-sm text-center mt-2">
                <button
                    type="button"
                    onClick={() => onSwitchView('login')}
                    className="text-blue-500"
                >
                    Already have an account? Log in
                </button>
            </div>
        </div>
    )
}