"use client";
import { useEffect, useState } from "react";

import ArticleForm from "@/app/components/common/ArticleForm";

interface ArticleData {
    title: string;
    content: string;
    tags: string;
    imageUrl?: string;
}

export default function EditArticlePage({ params } : { params: { id: string } }) {
    const [articleData, setArticleData] = useState<ArticleData | null>(null);
    useEffect(() => {
        const fetchArticle = async () => {
            const res = await fetch(`/api/articles/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setArticleData({
                    title: data.article.title,
                    content: data.article.content,
                    tags: data.article.tags.join(", "),
                    imageUrl: data.article.image,
                })
            }
        }
        fetchArticle()
    }, [params.id])

    const handleEdit = async (formData: FormData) => {
        await fetch(`/api/articles/${params.id}`, {
            method: "PATCH",
            body: formData
        })
    }

    if (!articleData) return <p>Loading...</p>;
    return <ArticleForm mode="edit" articleData={articleData} onSubmit={handleEdit} />;
}