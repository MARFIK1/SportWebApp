"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

import LoginForm from "../forms/LoginForm";
import RegisterForm from "../forms/RegisterForm";
import ResetPasswordForm from "../forms/ResetPasswordForm";
import { useUser } from "@/app/util/UserContext";

interface AuthModalProps {
    onClose: () => void;
    initialView?: "login" | "register" | "reset";
}

export default function AuthModal({ onClose, initialView = "login" } : AuthModalProps) {
    const [currentView, setCurrentView] = useState<"login" | "register" | "reset">(initialView);
    const modalRef = useRef<HTMLDivElement | null>(null);
    const router = useRouter();
    const { user } = useUser();
    const isUserLoggedIn = !!user;

    const handleCloseAndRedirect = () => {
        onClose();
        if (isUserLoggedIn) {
            router.push("/profile");
        }
        else {
            router.push("/");
        }
    }

    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
            handleCloseAndRedirect();
        }
    }

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50"
            onClick={handleOverlayClick}
        >
            <div
                ref={modalRef}
                className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md"
            >
                {currentView === "login" && <LoginForm onSwitchView={setCurrentView} />}
                {currentView === "register" && <RegisterForm onSwitchView={setCurrentView} />}
                {currentView === "reset" && (
                    <ResetPasswordForm
                        onSwitchView={setCurrentView}
                        isUserLoggedIn={isUserLoggedIn}
                    />
                )}
                <button
                    onClick={handleCloseAndRedirect}
                    className="mt-4 w-full px-4 py-2 bg-red-500 text-white rounded-lg"
                >
                    Close
                </button>
            </div>
        </div>
    )
}