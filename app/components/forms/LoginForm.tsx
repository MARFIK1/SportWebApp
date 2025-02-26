"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/util/UserContext";

export default function LoginForm({ onSwitchView } : { onSwitchView: (view: "login" | "register" | "reset") => void }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const { setUser } = useUser();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        })

        if (response.ok) {
            const data = await response.json();
            setUser({
                id: data.user.id,
                nickname: data.user.nickname,
                email: data.user.email,
                profile_picture: data.user.profile_picture,
                role: data.user.role,
                first_name: data.user.first_name ?? "",
                last_name: data.user.last_name ?? ""
            })
            router.push("/profile");
        }
        else {
            const data = await response.json();
            setError(data.error || "An error occurred during login.");
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-4"
        >
            <h2 className="text-2xl font-bold">
                Login
            </h2>
            {error && <p className="text-red-500">{error}</p>}
            <div>
                <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700"
                >
                    Email
                </label>
                <input
                    type="email"
                    id="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border rounded text-black"
                    required
                />
            </div>
            <div>
                <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700"
                >
                    Password
                </label>
                <input
                    type="password"
                    id="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border rounded text-black"
                    required
                />
            </div>
            <button
                type="submit"
                className="w-full bg-blue-500 text-white py-2 rounded"
            >
                Login
            </button>
            <div className="text-sm text-center mt-2">
                <button
                    type="button"
                    onClick={() => onSwitchView("register")}
                    className="text-blue-500"
                >
                    Register
                </button>
                {" | "}
                <button
                    type="button"
                    onClick={() => onSwitchView("reset")}
                    className="text-blue-500"
                >
                    Forgot your password?
                </button>
            </div>
        </form>
    )
}