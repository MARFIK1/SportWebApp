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
    const articlesPerPage = 3;
    const commentsPerPage = 6;
    const [sortArticlesAsc, setSortArticlesAsc] = useState(false);
    const [sortCommentsAsc, setSortCommentsAsc] = useState(false);
    const router = useRouter();
    const [isAdminView, setIsAdminView] = useState(false);
    const [allArticles, setAllArticles] = useState<Article[]>([]);
    const [allComments, setAllComments] = useState<Comment[]>([]);
    const [loadingAdminData, setLoadingAdminData] = useState(false);
    const [filteredArticles, setFilteredArticles] = useState<Article[]>([]);
    const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectComment, setRejectComment] = useState("");
    const [currentArticleId, setCurrentArticleId] = useState<string | null>(null);
    const [firstName, setFirstName] = useState(user?.first_name || "");
    const [lastName, setLastName] = useState(user?.last_name || "");
    const [isEditingName, setIsEditingName] = useState(false);

    useEffect(() => {
        if (userLoading) return;
        if (!user) {
            router.push("/user/login");
            return;
        }

        fetchActivity();
    }, [user, userLoading, router])

    async function fetchActivity() {
        try {
            const res = await fetch(`/api/users/activity`);
            if (res.ok) {
                const data = await res.json();
                const articlesWithDates = data.articles.map((article: Article) => ({
                    ...article,
                    created_at: new Date(article.created_at).toISOString(),
                    updated_at: article.updated_at ? new Date(article.updated_at).toISOString() : null,
                }));

                setArticles(
                    articlesWithDates.sort((a: Article, b: Article) => 
                        new Date(b.updated_at || b.created_at).getTime() - 
                        new Date(a.updated_at || a.created_at).getTime()
                    )
                );

                setFilteredArticles(
                    articlesWithDates.filter((article: Article) => article.status === "pending")
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

    const fetchAdminData = async () => {
        setLoadingAdminData(true);
        try {
            const [articlesRes, commentsRes] = await Promise.all([
                fetch("/api/admin/articles"),
                fetch("/api/admin/comments")
            ])

            if (articlesRes.ok) {
                const articlesData = await articlesRes.json();
                const mappedArticles = articlesData.articles.map((article: Article) => ({
                    ...article,
                    author: article.author || "Unknown",
                    status: String(article.status) as "pending" | "approved" | "rejected"
                }))
                setAllArticles(mappedArticles);
                setFilteredArticles(mappedArticles.filter((article: Article) => article.status === "pending"));
            }
    
            if (commentsRes.ok) {
                const commentsData = await commentsRes.json();
                setAllComments(commentsData.comments);
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
        if (!isAdminView) {
            fetchAdminData();
        }
        else {
            fetchActivity();
        }

        setIsAdminView(!isAdminView);
        setActiveFilter("pending");
        const articlesToFilter = !isAdminView ? allArticles : articles;
        setFilteredArticles(
            articlesToFilter.filter((article) => article.status === "pending")
        );
        setArticlesPage(1);
    }

    const paginate = (items: any[], page: number, itemsPerPage: number) => items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const renderPagination = (page: number, totalItems: number, setPage: (page: number) => void, itemsPerPage: number) => {
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

    const handleSaveName = async () => {
        try {
            const res = await fetch("/api/users/update-name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName })
            })
    
            if (res.ok) {
                const updatedUser = await res.json();
                setUser((prev: User | null): User | null => {
                    if (prev) {
                        return {
                            ...prev,
                            first_name: updatedUser.first_name,
                            last_name: updatedUser.last_name
                        }
                    }
                    return prev;
                })
    
                setIsEditingName(false);
            }
            else {
                console.error("Failed to update name");
            }
        }
        catch (err) {
            console.error("Error updating name:", err);
        }
    }

    const renderArticleActions = (article: Article) => {
        if (!isAdminView) return null;

        return (
            <div className="flex space-x-2">
                {
                    article.status === "pending" && (
                        <>
                            <button
                                onClick={() => updateArticleStatus(article.id, "approved")}
                                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => openRejectModal(article.id)}
                                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded"
                            >
                                Reject
                            </button>
                        </>
                    )
                }
                {
                    article.status === "approved" && (
                        <button
                            onClick={() => openRejectModal(article.id)}
                            className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded"
                        >
                            Reject
                        </button>
                    )
                }
                {
                    article.status === "rejected" && (
                        <button
                            onClick={() => updateArticleStatus(article.id, "approved")}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded"
                        >
                            Approve
                        </button>
                    )
                }
            </div>
        )
    }

    const updateArticleStatus = async (articleId: string, status: "pending" | "approved" | "rejected", comment?: string) => {
        try {
            const res = await fetch(`/api/admin/articles/${articleId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, admin_comment: comment || null })
            })
    
            if (res.ok) {
                const updatedArticle = await res.json();
                setArticles((prev) => prev.map((article) => 
                    article.id === articleId ? { ...article, status, admin_comment: comment || null } : article
                ));
    
                setFilteredArticles((prev) => prev.filter((article) => article.id !== articleId));
                setAllArticles((prev) => prev.map((article) => 
                    article.id === articleId ? { ...article, status, admin_comment: comment || null } : article
                ));
    
                if (activeFilter === status || activeFilter === "all") {
                    setFilteredArticles((prev) => [
                        ...prev,
                        { ...updatedArticle, status, admin_comment: comment || null },
                    ]);
                }
            }
            else {
                console.error("Failed to update article status");
            }
        }
        catch (err) {
            console.error("Error updating article status:", err);
        }
    }

    const filterArticles = (status: "all" | "pending" | "approved" | "rejected") => {
        setActiveFilter(status);
        setArticlesPage(1);
        const articlesToFilter = isAdminView ? allArticles : articles;
    
        if (status === "all") {
            setFilteredArticles(articlesToFilter);
        }
        else {
            setFilteredArticles(articlesToFilter.filter((article) => article.status === status));
        }
    }
    
    const handleRejectArticle = async () => {
        if (!currentArticleId) return;

        try {
            const res = await fetch(`/api/admin/articles/${currentArticleId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "rejected", admin_comment: rejectComment })
            })

            if (res.ok) {
                const updatedArticle = await res.json();
                setFilteredArticles((prev) => prev.filter((article) => article.id !== currentArticleId));
                setAllArticles((prev) =>
                    prev.map((article) =>
                        article.id === currentArticleId ? { ...article, status: "rejected", admin_comment: rejectComment } : article
                    )
                )

                if (activeFilter === "rejected" || activeFilter === "all") {
                    setFilteredArticles((prev) => [
                        ...prev,
                        { ...updatedArticle, status: "rejected", admin_comment: rejectComment },
                    ]);
                }

                setIsRejectModalOpen(false);
                setRejectComment("");
            }
            else {
                console.error("Failed to reject article");
            }
        }
        catch (err) {
            console.error("Error rejecting article:", err);
        }
    }

    const openRejectModal = (articleId: string) => {
        setCurrentArticleId(articleId);
        setIsRejectModalOpen(true);
    }

    const deleteArticle = async (articleId: string) => {
        try {
            const res = await fetch(`/api/admin/articles/${articleId}`, {
                method: "DELETE"
            })
    
            if (res.ok) {
                setArticles((prev) => prev.filter((article) => article.id !== articleId));
                setFilteredArticles((prev) => prev.filter((article) => article.id !== articleId));
                setAllArticles((prev) => prev.filter((article) => article.id !== articleId));
            }
            else {
                console.error("Failed to delete article");
            }
        }
        catch (err) {
            console.error("Error deleting article:", err);
        }
    }
    
    const deleteComment = async (commentId: string) => {
        try {
            const res = await fetch(`/api/admin/comments/${commentId}`, {
                method: "DELETE"
            })
    
            if (res.ok) {
                setComments((prev) => prev.filter((comment) => comment.id !== commentId));
                setAllComments((prev) => prev.filter((comment) => comment.id !== commentId));
            }
            else {
                console.error("Failed to delete comment");
            }
        }
        catch (err) {
            console.error("Error deleting comment:", err);
        }
    }

    const toggleSortArticles = () => {
        const newOrder = !sortArticlesAsc;
        setSortArticlesAsc(newOrder);
        setArticles((prev) =>
            [...prev].sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at).getTime();
                const dateB = new Date(b.updated_at || b.created_at).getTime();
                return newOrder ? dateA - dateB : dateB - dateA;
            })
        )
        setFilteredArticles((prev) =>
            [...prev].sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at).getTime();
                const dateB = new Date(b.updated_at || b.created_at).getTime();
                return newOrder ? dateA - dateB : dateB - dateA;
            })
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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="col-span-3 bg-gray-800 p-6 rounded-lg shadow-lg h-[750px]">
                    <div className="flex flex-col items-center space-y-4">
                        <label
                            htmlFor="avatar-upload"
                            className="cursor-pointer"
                        >
                            <img
                                src={user?.profile_picture || "default-avatar.png"}
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
                        <div className="mt-4">
                            <label className="block text-sm text-gray-400">
                                First Name
                            </label>
                            <input
                                type="text"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                disabled={!isEditingName}
                                className={`px-4 py-2 border rounded-lg w-full ${
                                    isEditingName
                                        ? "bg-gray-700 text-white border-gray-600"
                                        : "bg-gray-800 text-gray-500 border-gray-700"
                                }`}
                            />
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm text-gray-400">
                                Last Name
                            </label>
                            <input
                                type="text"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                disabled={!isEditingName}
                                className={`px-4 py-2 border rounded-lg w-full ${
                                    isEditingName
                                        ? "bg-gray-700 text-white border-gray-600"
                                        : "bg-gray-800 text-gray-500 border-gray-700"
                                }`}
                            />
                        </div>
                        <div className="flex space-x-4 mt-4">
                            {
                                isEditingName ? (
                                    <button
                                        onClick={handleSaveName}
                                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
                                    >
                                        Save
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setIsEditingName(true)}
                                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
                                    >
                                        Edit
                                    </button>
                                )
                            }
                        </div>
                        <button
                            onClick={() => router.push("/user/login?view=reset")}
                            className="bg-red-500 hover:bg-red-600 px-4 py-2 text-white rounded-lg mt-4"
                        >
                            Reset Password
                        </button>
                        {
                            user?.role === "admin" && (
                                <div className="mt-4">
                                    <button
                                        onClick={toggleAdminView}
                                        className="bg-green-500 hover:bg-green-600 px-4 py-2 text-white rounded-lg"
                                    >
                                        Switch to {isAdminView ? "User View" : "Admin View"}
                                    </button>
                                </div>
                            )
                        }
                    </div>
                </div>
                <div className="col-span-5 bg-gray-800 p-6 rounded-lg shadow-lg h-[750px] flex flex-col">
                    <div className="flex space-x-1 mb-4 justify-start">
                        {
                            ["all", "pending", "approved", "rejected"].map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => filterArticles(filter as "all" | "pending" | "approved" | "rejected")}
                                    className={`px-3 py-2 rounded ${
                                        activeFilter === filter
                                        ? filter === "pending"
                                            ? "bg-yellow-500 text-black"
                                            : filter === "approved"
                                            ? "bg-green-500 text-white"
                                            : filter === "rejected"
                                            ? "bg-red-500 text-white"
                                            : "bg-blue-500 text-white"
                                        : "bg-gray-600 hover:bg-gray-500 text-gray-300"
                                    }`}
                                >
                                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </button>
                            ))
                        }
                    </div>
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold">
                            {isAdminView ? "All Articles" : "Your Articles"}
                        </h2>
                        <button
                            onClick={() => {
                                if (isAdminView) {
                                    const newOrder = !sortArticlesAsc;
                                    setSortArticlesAsc(newOrder);
                                    setFilteredArticles((prev) =>
                                        [...prev].sort((a, b) =>
                                            newOrder
                                                ? new Date(a.created_at).getTime() -
                                                new Date(b.created_at).getTime()
                                                : new Date(b.created_at).getTime() -
                                                new Date(a.created_at).getTime()
                                        )
                                    )
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
                    <div className="flex-grow overflow-y-scroll scrollbar-hide">
                        {
                            filteredArticles.length === 0 ? (
                                <p className="text-center text-gray-400 mt-10">
                                    No articles available in this category.
                                </p>
                            ) : (
                                paginate(filteredArticles, articlesPage, articlesPerPage).map((article) => (
                                    <div
                                        key={article.id}
                                        className="mt-4 border-b border-gray-600 pb-4 flex items-center justify-between space-x-4"
                                    >
                                        <div className="flex-1">
                                            <h3
                                                className={`text-xl font-bold ${
                                                    (isAdminView && (article.status === "approved" || article.status === "pending")) ||
                                                    (!isAdminView && article.status === "approved")
                                                        ? "text-blue-400 hover:underline cursor-pointer"
                                                        : "text-gray-400"
                                                }`}
                                                onClick={() => {
                                                    if (
                                                        (isAdminView && (article.status === "approved" || article.status === "pending")) ||
                                                        (!isAdminView && article.status === "approved")
                                                    ) {
                                                        router.push(`/blog/${article.id}`);
                                                    }
                                                }}
                                            >
                                                {article.title}
                                            </h3>
                                            {
                                                isAdminView && (
                                                    <p className="text-sm text-gray-400">
                                                        <span className="font-bold">By: {article.author || "Unknown"}</span>
                                                    </p>
                                                )
                                            }
                                            <p
                                                className={`text-sm ${
                                                    article.status === "pending"
                                                        ? "text-yellow-500"
                                                        : article.status === "approved"
                                                        ? "text-green-500"
                                                        : "text-red-500"
                                                }`}
                                            >
                                                Status: {article.status}
                                            </p>
                                            {
                                                article.status === "rejected" && (
                                                    <p className="text-sm text-red-400">
                                                        Reason: {article.admin_comment || <i>No comment added</i>}
                                                    </p>
                                                )
                                            }
                                            <p className="text-sm text-gray-400">
                                                Created at: {new Date(article.created_at).toLocaleString()}
                                            </p>
                                            <p className="text-sm text-gray-400">
                                                Updated at: {new Date(article.updated_at).toLocaleString()}
                                            </p>
                                        </div>
                                        {renderArticleActions(article)}
                                        <div className="flex space-x-2">
                                            {
                                                !isAdminView && (
                                                    <button
                                                        onClick={() => router.push(`/blog/edit/${article.id}`)}
                                                        className="w-8 h-8 bg-blue-500 hover:bg-blue-400 text-white rounded-full flex items-center justify-center text-xl"
                                                        title="Edit"
                                                    >
                                                        ✎
                                                    </button>
                                                )
                                            }
                                            <button
                                                onClick={() => deleteArticle(article.id)}
                                                className="w-8 h-8 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center text-xl"
                                                title="Delete"
                                            >
                                                X
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )
                        }
                    </div>
                    <div className="mt-4">
                        {renderPagination(
                            articlesPage,
                            filteredArticles.length,
                            setArticlesPage,
                            articlesPerPage
                        )}
                    </div>
                </div>
                <div className="col-span-4 bg-gray-800 p-6 rounded-lg shadow-lg h-[750px] flex flex-col">
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
                                                ? new Date(a.created_at).getTime() -
                                                new Date(b.created_at).getTime()
                                                : new Date(b.created_at).getTime() -
                                                new Date(a.created_at).getTime()
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
                    <div className="flex-grow overflow-y-scroll scrollbar-hide">
                        {
                            isAdminView ? (
                                allComments.length === 0 ? (
                                    <p className="text-center text-gray-400 mt-10">
                                        No comments available.
                                    </p>
                                ) : (
                                    paginate(allComments, commentsPage, commentsPerPage).map((comment) => (
                                        <div
                                            key={comment.id}
                                            className="mt-4 border-b border-gray-600 pb-4 flex items-center justify-between space-x-4"
                                        >
                                            <div className="flex-1">
                                                <p className="text-gray-300">
                                                    {comment.content}
                                                </p>
                                                {
                                                    isAdminView && (
                                                        <p className="text-sm text-gray-400">
                                                            <span className="font-bold">
                                                                By: {comment.author}
                                                            </span>
                                                        </p>
                                                    )
                                                }
                                                <p className="text-sm text-gray-400">
                                                    On:{" "}
                                                    {
                                                        comment.article_id ? (
                                                            <a
                                                                href={`/blog/${comment.article_id}`}
                                                                className="text-blue-400 hover:underline"
                                                            >
                                                                {comment.article_title || "Unknown Article"}
                                                            </a>
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
                                            <button
                                                onClick={() => deleteComment(comment.id)}
                                                className="w-8 h-8 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center text-xl"
                                                title="Delete"
                                            >
                                                X
                                            </button>
                                        </div>
                                    ))
                                )
                            ) : (
                                comments.length === 0 ? (
                                    <p className="text-center text-gray-400 mt-10">
                                        You have not posted any comments yet.
                                    </p>
                                ) : (
                                    paginate(comments, commentsPage, commentsPerPage).map((comment) => (
                                        <div
                                            key={comment.id}
                                            className="mt-4 border-b border-gray-600 pb-4 flex items-center justify-between space-x-4"
                                        >
                                            <div className="flex-1">
                                                <p className="text-gray-300">
                                                    {comment.content}
                                                </p>
                                                <p className="text-sm text-gray-400">
                                                    On:{" "}
                                                    {
                                                        comment.article_id ? (
                                                            <a
                                                                href={`/blog/${comment.article_id}`}
                                                                className="text-blue-400 hover:underline"
                                                            >
                                                                {comment.article_title || "Unknown Article"}
                                                            </a>
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
                                            <button
                                                onClick={() => deleteComment(comment.id)}
                                                className="w-8 h-8 bg-red-500 hover:bg-red-400 text-white rounded-full flex items-center justify-center text-xl"
                                                title="Delete"
                                            >
                                                X
                                            </button>
                                        </div>
                                    ))
                                )
                            )
                        }
                    </div>
                    <div className="mt-4">
                        {renderPagination(
                            commentsPage,
                            isAdminView ? allComments.length : comments.length,
                            setCommentsPage,
                            commentsPerPage
                        )}
                    </div>
                </div>
                {
                    isRejectModalOpen && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
                            <div className="bg-gray-800 p-6 rounded-lg w-96">
                                <h2 className="text-xl font-bold text-white mb-4">
                                    Reject Article
                                </h2>
                                <textarea
                                    value={rejectComment}
                                    onChange={(e) => setRejectComment(e.target.value)}
                                    placeholder="Enter rejection comment (optional)"
                                    className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-white mb-4"
                                />
                                <div className="flex justify-end space-x-4">
                                    <button
                                        onClick={() => setIsRejectModalOpen(false)}
                                        className="px-4 py-2 bg-gray-500 hover:bg-gray-400 text-white rounded"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleRejectArticle}
                                        className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    )
}