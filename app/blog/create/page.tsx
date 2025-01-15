"use client";

import ArticleForm from "@/app/components/common/ArticleForm";

export default function CreateArticlePage() {
    const handleCreate = async (formData: FormData) => {
        await fetch("/api/articles/create", {
            method: "POST",
            body: formData,
        })
    }

    return <ArticleForm mode="create" onSubmit={handleCreate} />;
}