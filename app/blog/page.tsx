"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/util/UserContext";
import { Article } from "@/types";

export default function BlogPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const { user } = useUser();
    const router = useRouter();

    useEffect(() => {
        const fetchArticles = async () => {
            const res = await fetch("/api/articles");
            if (res.ok) {
                const data = await res.json();
                const approvedArticles = data.articles.filter((article: Article) => article.status === "approved");
                setArticles(approvedArticles);
            }
        }
        fetchArticles();
    }, [])

    const handleAddArticle = () => {
        router.push("/blog/create");
    }

    return (
        <div className="max-w-5xl mx-auto mt-10">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">
                    Latest Articles
                </h1>
                {
                    user && (
                        <button
                            onClick={handleAddArticle}
                            className="px-4 py-2 bg-blue-500 text-white rounded"
                        >
                            Add Article
                        </button>
                    )
                }
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {
                    articles.map((article) => (
                        <div
                            key={article.id}
                            className="border rounded-lg overflow-hidden cursor-pointer"
                            onClick={() => router.push(`/blog/${article.id}`)}
                        >
                            {
                                article.image && (
                                    <img
                                        src={article.image}
                                        alt={article.title}
                                        className="w-full h-48 object-cover"
                                    />
                                )
                            }
                            <div className="p-4">
                                <h2 className="text-xl font-bold">
                                    {article.title}
                                </h2>
                                <p className="text-gray-500">
                                    {article.tags.join(", ")}
                                </p>
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    )
}