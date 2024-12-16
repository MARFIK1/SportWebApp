"use client";
import { useState } from "react";

import AuthModal from "@/app/components/common/AuthModal";

export default function LoginPage() {
    const [isModalOpen, setIsModalOpen] = useState(true);
    const handleClose = () => setIsModalOpen(false);

    return (
        <div className="flex justify-center items-center h-screen bg-gray-800 text-white">
            {isModalOpen && <AuthModal onClose={handleClose} />}
        </div>
    )
}