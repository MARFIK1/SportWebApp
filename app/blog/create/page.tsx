"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateArticlePage() {
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [image, setImage] = useState<File | null>(null);
    const [tags, setTags] = useState<string>("");
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append("title", title);
        formData.append("content", content);
        if (image) formData.append("image", image);
        formData.append("tags", tags);
        const response = await fetch("/api/articles/create", {
            method: "POST",
            body: formData
        })

        if (response.ok) {
            router.push("/blog");
        }
    }

    const handleCancel = () => {
        router.push("/blog");
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="max-w-lg mx-auto mt-10 space-y-4"
        >
            <h1 className="text-3xl font-bold mb-6 text-white">
                Create New Article
            </h1>
            <div>
                <label
                    htmlFor="title"
                    className="block text-sm font-medium text-gray-200"
                >
                    Title
                </label>
                <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 border rounded bg-gray-800 text-white"
                    required
                />
            </div>
            <div>
                <label
                    htmlFor="content"
                    className="block text-sm font-medium text-gray-200"
                >
                    Content
                </label>
                <textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full px-4 py-2 border rounded bg-gray-800 text-white"
                    rows={6}
                    required
                />
            </div>
            <div>
                <label
                    htmlFor="image"
                    className="block text-sm font-medium text-gray-200"
                >
                    Image
                </label>
                <input
                    type="file"
                    id="image"
                    onChange={(e) => setImage(e.target.files ? e.target.files[0] : null)}
                    className="w-full text-gray-300"
                />
            </div>
            <div>
                <label
                    htmlFor="tags"
                    className="block text-sm font-medium text-gray-200"
                >
                    Tags (comma-separated)
                </label>
                <input
                    type="text"
                    id="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full px-4 py-2 border rounded bg-gray-800 text-white"
                />
            </div>
            <div className="flex justify-end space-x-2">
                <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 bg-red-500 text-white rounded"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 text-white rounded"
                >
                    Submit
                </button>
            </div>
        </form>
    )
}