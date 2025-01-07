"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/util/UserContext";
import { Article, Comment, User } from "@/types";

export default function ProfilePage() {
    const { user, isLoading: userLoading, setUser } = useUser();
    const [articles, setArticles] = useState<Article[]>([]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [nickname, setNickname] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [articlesPage, setArticlesPage] = useState(1);
    const [commentsPage, setCommentsPage] = useState(1);
    const itemsPerPage = 4;
    const [sortArticlesAsc, setSortArticlesAsc] = useState(false);
    const [sortCommentsAsc, setSortCommentsAsc] = useState(false);
    const router = useRouter();
    const [isAdminView, setIsAdminView] = useState(false);
    const [allArticles, setAllArticles] = useState<Article[]>([]);
    const [allComments, setAllComments] = useState<Comment[]>([]);
    const [loadingAdminData, setLoadingAdminData] = useState(false);

    useEffect(() => {
        if (userLoading) return;
        if (!user) {
            router.push("/user/login");
            return;
        }

        async function fetchActivity() {
            try {
                const res = await fetch(`/api/users/activity`);
                if (res.ok) {
                    const data = await res.json();
                    setArticles(
                        data.articles.sort((a: Article, b: Article) =>
                            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        )
                    );
                    setComments(
                        data.comments.sort((a: Comment, b: Comment) =>
                            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        )
                    );
                }
                else {
                    setError("Failed to fetch user activity.");
                }
            }
            catch (err) {
                console.error("Error fetching activity:", err);
                setError("An error occurred while fetching activity.");
            }
            finally {
                setLoading(false);
            }
        }
        fetchActivity();
    }, [user, userLoading, router]);

    const fetchAdminData = async () => {
        setLoadingAdminData(true);
        try {
            const articlesRes = await fetch("/api/admin/articles");
            const commentsRes = await fetch("/api/admin/comments");
            if (articlesRes.ok && commentsRes.ok) {
                const articlesData = await articlesRes.json();
                const commentsData = await commentsRes.json();
                setAllArticles(articlesData.articles || []);
                setAllComments(commentsData.comments || []);
            }
        }
        catch (err) {
            console.error("Error fetching admin data:", err);
        }
        finally {
            setLoadingAdminData(false);
        }
    }
    
    const toggleAdminView = () => {
        if (!isAdminView) fetchAdminData();
        setIsAdminView(!isAdminView);
    }

    const paginate = (items: any[], page: number) => items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const renderPagination = (page: number, totalItems: number, setPage: (page: number) => void) => {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (totalPages <= 1) return null;

        return (
            <div className="flex justify-center mt-4 space-x-2">
                {
                    page > 1 && (
                        <button
                            onClick={() => setPage(1)}
                            className="px-3 py-1 bg-gray-700 text-white rounded"
                        >
                            {"<<"}
                        </button>
                    )
                }
                {
                    page > 1 && (
                        <button
                            onClick={() => setPage(page - 1)}
                            className="px-3 py-1 bg-gray-700 text-white rounded"
                        >
                            {page - 1}
                        </button>
                    )
                }
                <button className="px-3 py-1 bg-blue-500 text-white rounded">
                    {page}
                </button>
                {
                    page < totalPages && (
                        <button
                            onClick={() => setPage(page + 1)}
                            className="px-3 py-1 bg-gray-700 text-white rounded"
                        >
                            {page + 1}
                        </button>
                    )
                }
                {
                    page < totalPages && (
                        <button
                            onClick={() => setPage(totalPages)}
                            className="px-3 py-1 bg-gray-700 text-white rounded"
                        >
                            {">>"}
                        </button>
                    )
                }
            </div>
        )
    }

    const handleAvatarClick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (file) {
            const formData = new FormData();
            formData.append("avatar", file);
            formData.append("userId", user?.id || "");
            try {
                const res = await fetch("/api/users/update-avatar", {
                    method: "POST",
                    body: formData,
                });
                if (res.ok) {
                    const { avatarUrl } = await res.json();
                    setUser((prev: User | null): User | null => {
                        if (prev) {
                            return {
                                ...prev,
                                profile_picture: avatarUrl,
                            };
                        }
                        return prev;
                    });
                }
                else {
                    console.error("Failed to update avatar.");
                    setError("Failed to update avatar.");
                }
            }
            catch (err) {
                console.error("Error updating avatar:", err);
                setError("An error occurred while updating avatar.");
            }
        }
    }

    const handleNicknameChange = async () => {
        try {
            const res = await fetch("/api/users/update-nickname", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nickname }),
            });
            if (res.ok) {
                setUser((prev: User | null): User | null => {
                    if (prev) {
                        return {
                            ...prev,
                            nickname,
                        };
                    }
                    return prev;
                });
            }
            else {
                console.error("Failed to update nickname.");
                setError("Failed to update nickname.");
            }
        }
        catch (err) {
            console.error("Error updating nickname:", err);
            setError("An error occurred while updating nickname.");
        }
    }

    const toggleSortArticles = () => {
        const newOrder = !sortArticlesAsc;
        setSortArticlesAsc(newOrder);
        setArticles((prev) =>
            [...prev].sort((a, b) =>
                newOrder
                    ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
        )
    }

    const toggleSortComments = () => {
        const newOrder = !sortCommentsAsc;
        setSortCommentsAsc(newOrder);
        setComments((prev) =>
            [...prev].sort((a, b) =>
                newOrder
                    ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
        )
    }

    if (userLoading || loading) return <p>Loading...</p>;
    if (error) return <p className="text-red-500">{error}</p>;

    return (
        <div className="container mx-auto p-4 text-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="col-span-1 bg-gray-800 p-6 rounded-lg shadow-lg h-[600px]">
                    <div className="flex flex-col items-center space-y-4">
                        <label
                            htmlFor="avatar-upload"
                            className="cursor-pointer"
                        >
                            <img
                                src={user?.profile_picture || "/default-avatar.png"}
                                alt="Profile Avatar"
                                className="w-32 h-32 rounded-full border-4 border-gray-600 hover:opacity-80"
                                title="Click to change avatar"
                            />
                        </label>
                        <input
                            id="avatar-upload"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleAvatarClick}
                        />
                        <h1 className="text-3xl font-bold">
                            {user?.nickname || "Your Profile"}
                        </h1>
                    </div>
                    <div className="mt-6">
                        <h2 className="text-xl font-bold">
                            Update Nickname
                        </h2>
                        <div className="flex items-center space-x-4 mt-4">
                            <input
                                type="text"
                                placeholder="Enter new nickname"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 w-full"
                            />
                            <button
                                onClick={handleNicknameChange}
                                className="bg-blue-500 hover:bg-blue-600 px-4 py-2 text-white rounded-lg"
                            >
                                Update
                            </button>
                        </div>
                    </div>
                    <div className="mt-6">
                        <h2 className="text-xl font-bold">
                            Account Settings
                        </h2>
                        <button
                            onClick={() => router.push("/user/login?view=reset")}
                            className="bg-red-500 hover:bg-red-600 px-4 py-2 text-white rounded-lg mt-4"
                        >
                            Reset Password
                        </button>
                        {
                            user?.role === "admin" && (
                                <button
                                    onClick={toggleAdminView}
                                    className="bg-green-500 hover:bg-green-600 px-4 py-2 text-white rounded-lg mt-4"
                                >
                                    Switch to {isAdminView ? "User View" : "Admin View"}
                                </button>
                            )
                        }
                    </div>
                </div>
                <div className="col-span-1 bg-gray-800 p-6 rounded-lg shadow-lg h-[600px] flex flex-col">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold">
                            {isAdminView ? "All Articles" : "Your Articles"}
                        </h2>
                        <button
                            onClick={() => {
                                if (isAdminView) {
                                    const newOrder = !sortArticlesAsc;
                                    setSortArticlesAsc(newOrder);
                                    setAllArticles((prev) =>
                                        [...prev].sort((a, b) =>
                                            newOrder
                                                ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                                        )
                                    );
                                }
                                else {
                                    toggleSortArticles();
                                }
                            }}
                            className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                        >
                            Sort {sortArticlesAsc ? "Ascending" : "Descending"}
                        </button>
                    </div>
                    <div className="flex-grow">
                        {
                            (isAdminView ? paginate(allArticles, articlesPage) : paginate(articles, articlesPage)).map(
                                (article) => (
                                    <div
                                        key={article.id}
                                        className="mt-4"
                                    >
                                        <a
                                            href={`/blog/${article.id}`}
                                            className="text-blue-400 hover:underline text-lg"
                                        >
                                            {article.title}
                                        </a>
                                        <p className="text-sm text-gray-400">
                                            Status: {article.status}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Created: {new Date(article.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                )
                            )
                        }
                    </div>
                    <div className="mt-4">
                        {
                            renderPagination(
                                articlesPage,
                                isAdminView ? allArticles.length : articles.length,
                                setArticlesPage
                            )
                        }
                    </div>
                </div>
                <div className="col-span-1 bg-gray-800 p-6 rounded-lg shadow-lg h-[600px] flex flex-col">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold">
                            {isAdminView ? "All Comments" : "Your Comments"}
                        </h2>
                        <button
                            onClick={() => {
                                if (isAdminView) {
                                    const newOrder = !sortCommentsAsc;
                                    setSortCommentsAsc(newOrder);
                                    setAllComments((prev) =>
                                        [...prev].sort((a, b) =>
                                            newOrder
                                                ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                                        )
                                    );
                                }
                                else {
                                    toggleSortComments();
                                }
                            }}
                            className="text-sm bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                        >
                            Sort {sortCommentsAsc ? "Ascending" : "Descending"}
                        </button>
                    </div>
                    <div className="flex-grow">
                        {
                            (isAdminView ? paginate(allComments, commentsPage) : paginate(comments, commentsPage)).map(
                                (comment) => (
                                    <div
                                        key={comment.id}
                                        className="mt-4"
                                    >
                                        <p className="text-gray-300">
                                            {comment.content}
                                        </p>
                                        {
                                            isAdminView && (
                                                <p className="text-sm text-gray-400">
                                                    <span className="font-bold">
                                                        By: {comment.author || "Unknown User"}
                                                    </span>
                                                </p>
                                            )
                                        }
                                        <p className="text-sm text-gray-400">
                                            On:{" "}
                                            {
                                                comment.article_id ? (
                                                    comment.article_title ? (
                                                        <a
                                                            href={`/blog/${comment.article_id}`}
                                                            className="text-blue-400 hover:underline"
                                                        >
                                                            {comment.article_title}
                                                        </a>
                                                    ) : (
                                                        <span className="text-gray-500">
                                                            Article not available
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-500">
                                                        Article not available
                                                    </span>
                                                )
                                            }
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Created: {new Date(comment.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                )
                            )
                        }
                    </div>
                    <div className="mt-4">
                        {
                            renderPagination(
                                commentsPage,
                                isAdminView ? allComments.length : comments.length,
                                setCommentsPage
                            )
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}