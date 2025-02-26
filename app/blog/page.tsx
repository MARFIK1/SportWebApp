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
        <div className="max-w-7xl mx-auto mt-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">
                    Latest Articles
                </h1>
                {
                    user && (
                        <button
                            onClick={handleAddArticle}
                            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                        >
                            Add Article
                        </button>
                    )
                }
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {
                    articles.map((article) => (
                        <div
                            key={article.id}
                            className="rounded-lg overflow-hidden shadow-lg bg-gray-800 hover:scale-105 transition-all cursor-pointer flex flex-col"
                            onClick={() => router.push(`/blog/${article.id}`)}
                        >
                            {
                                article.image && (
                                    <img
                                        src={article.image}
                                        alt={article.title}
                                        className="w-full h-56 object-cover"
                                    />
                                )
                            }
                            <div className="p-5 flex-grow">
                                <h2 className="text-xl font-bold text-white mb-2">
                                    {article.title}
                                </h2>
                                <p className="text-gray-400 mb-4">
                                    {article.tags.join(", ")}
                                </p>
                            </div>
                            <div className="flex justify-between items-center border-t border-gray-600 p-4 min-h-[70px]">
                                <div className="flex items-center space-x-3">
                                    <img
                                        src={article.author_picture || "default-avatar.png"}
                                        alt={article.author}
                                        className="w-12 h-12 rounded-full border border-gray-500"
                                    />
                                    <p className="text-white font-semibold">
                                        {article.author || "Unknown Author"}
                                    </p>
                                </div>
                                <p className="text-gray-400 text-sm">
                                    💬 {article.comment_count || 0}
                                </p>
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    )
}