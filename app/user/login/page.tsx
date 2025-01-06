"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

import AuthModal from "@/app/components/common/AuthModal";

export default function LoginPage() {
    const searchParams = useSearchParams();
    const initialView = searchParams.get("view") as "login" | "register" | "reset" || "login";
    const [isModalOpen, setIsModalOpen] = useState(true);
    const handleClose = () => setIsModalOpen(false);

    return (
        <div className="flex justify-center items-center h-screen bg-gray-800 text-white">
            {
                isModalOpen && <AuthModal
                                    onClose={handleClose}
                                    initialView={initialView}
                                />
            }
        </div>
    )
}