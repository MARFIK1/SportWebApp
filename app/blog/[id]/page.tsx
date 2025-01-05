"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { Article, Comment } from "@/types";

export default function ArticlePage() {
    const [article, setArticle] = useState<Article | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { id } = useParams();

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                const res = await fetch(`/api/articles/${id}`);
                if (!res.ok) {
                    setError("Article not found");
                    return;
                }
                const data = await res.json();
                setArticle(data.article);
                setComments(data.comments);
            }
            catch (err) {
                console.error("Error fetching article:", err);
                setError("Error fetching article");
            }
            finally {
                setIsLoading(false);
            }
        }
        fetchArticle();
    }, [id])

    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const response = await fetch(`/api/articles/${id}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: newComment }),
        })

        if (response.ok) {
            const newCommentData = await response.json();
            setComments((prev) => [newCommentData.comment, ...prev]);
            setNewComment("");
        }
    }

    if (isLoading) return <p className="text-white text-center mt-10">Loading...</p>;
    if (error) return <p className="text-red-500 text-center mt-10">{error}</p>;
    if (!article) return null;

    return (
        <div className="max-w-7xl mx-auto mt-10 grid grid-cols-3 gap-8 text-white">
            <div className="col-span-2">
                <h1 className="text-4xl font-bold mb-6">
                    {article.title}
                </h1>
                {
                    article.image && (
                        <img
                            src={article.image}
                            alt={article.title}
                            className="w-full h-auto rounded-lg mb-6"
                        />
                    )
                }
                <p className="text-gray-400 mb-4">
                    {article.tags.join(", ")}
                </p>
                <p className="text-lg leading-relaxed">
                    {article.content}
                </p>
                <button
                    onClick={() => router.back()}
                    className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    Back to Blog
                </button>
            </div>
            <div className="space-y-6">
                <div className="p-6 bg-gray-800 rounded-lg text-center shadow-lg">
                    {
                        article.author ? (
                            <>
                                <img
                                    src={article.author_picture || "/default-avatar.png"}
                                    alt={article.author}
                                    className="w-20 h-20 rounded-full mx-auto mb-4"
                                />
                                <p className="text-xl font-bold">
                                    {article.author}
                                </p>
                            </>
                        ) : (
                            <p className="text-gray-400">
                                Author information not available
                            </p>
                        )
                    }
                </div>
                <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
                    <h2 className="text-xl font-bold mb-4">
                        Comments
                    </h2>
                    {
                        comments.length > 0 ? (
                            <ul className="space-y-6">
                                {
                                    comments.map((comment) => (
                                        <li
                                            key={comment.id}
                                            className="border-b pb-4"
                                        >
                                            <div className="flex items-center space-x-4">
                                                <img
                                                    src={comment.profile_picture || "/default-avatar.png"}
                                                    alt={comment.author}
                                                    className="w-10 h-10 rounded-full"
                                                />
                                                <div>
                                                    <p className="font-semibold">
                                                        {comment.author}
                                                    </p>
                                                    <p className="text-sm text-gray-400">
                                                        {new Date(comment.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="mt-2">
                                                {comment.content}
                                            </p>
                                        </li>
                                    ))
                                }
                            </ul>
                        ) : (
                            <p className="text-gray-400">
                                No comments yet.
                            </p>
                        )
                    }
                    <form
                        onSubmit={handleCommentSubmit}
                        className="mt-4"
                    >
                        <textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="w-full px-4 py-2 border rounded-lg bg-gray-700 text-white"
                            placeholder="Write a comment..."
                            rows={3}
                            required
                        >
                        </textarea>
                        <button
                            type="submit"
                            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg w-full hover:bg-blue-600"
                        >
                            Add Comment
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}