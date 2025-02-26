"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

export default function ArticleForm({ mode, articleData, onSubmit } : { mode: "create" | "edit", articleData?: { title: string; content: string; tags: string; imageUrl?: string }, onSubmit: (formData: FormData) => void }) {
    const [title, setTitle] = useState(articleData?.title || "");
    const [content, setContent] = useState(articleData?.content || "");
    const [tags, setTags] = useState(articleData?.tags || "");
    const [image, setImage] = useState<File | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(articleData?.imageUrl || null);
    const [currentImagePath, setCurrentImagePath] = useState<string | null>(mode === "edit" ? articleData?.imageUrl || null : null);
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        if (image) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result as string);
            }
            reader.readAsDataURL(image);
        }
        else if (mode === "edit" && articleData?.imageUrl) {
            setPreviewImage(articleData.imageUrl);
        }
        else {
            setPreviewImage(null);
        }
    }, [image, articleData?.imageUrl, mode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append("title", title);
        formData.append("content", content);
        formData.append("tags", tags);
        if (image) formData.append("image", image);
        await onSubmit(formData);
        setMessage("Changes saved successfully. The article's status has been set to 'pending' and is awaiting administrator approval.");
    }

    const handleOkClick = () => {
        window.location.href = "/profile";
    }

    return (
        <div className="max-w-3xl mx-auto mt-10">
            <form
                onSubmit={handleSubmit}
                className="space-y-6"
            >
                <h1 className="text-3xl font-bold mb-6 text-white">
                    {mode === "create" ? "Create New Article" : "Edit Article"}
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
                <div className="mb-16">
                    <label
                        htmlFor="content"
                        className="block text-sm font-medium text-gray-200"
                    >
                        Content
                    </label>
                    <ReactQuill
                        theme="snow"
                        value={content}
                        onChange={setContent}
                        className="bg-gray-200 text-black"
                        style={{
                            maxHeight: "500px", 
                            minHeight: "250px",
                            overflow: "hidden"
                        }}
                    />
                    <style>
                        {`.ql-editor iframe {
                            width: 100%;
                            height: 500px !important; /* Wymuszamy większą wysokość */
                            max-width: 100%;
                            border-radius: 8px;
                        }`}
                    </style>
                </div>
                <div className="mb-8">
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
                    {
                        mode === "edit" && currentImagePath && (
                            <p className="text-sm text-gray-400 mt-2">
                                Current Image: <span className="text-gray-200">{currentImagePath.replace("/uploads/", "")}</span>
                            </p>
                        )
                    }
                    {
                        previewImage && (
                            <div className="mt-4">
                                <p className="text-sm text-gray-200 mb-2">
                                    Image Preview:
                                </p>
                                <img
                                    src={previewImage}
                                    alt="Preview"
                                    className="max-h-48 rounded border border-gray-700"
                                />
                            </div>
                        )
                    }
                </div>
                <div className="flex justify-end space-x-2">
                    <button
                        type="button"
                        onClick={() => window.history.back()}
                        className="px-4 py-2 bg-red-500 text-white rounded"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-500 text-white rounded"
                    >
                        {mode === "create" ? "Submit" : "Save"}
                    </button>
                </div>
            </form>
            {
                message && (
                    <div className="mt-6 p-4 bg-gray-800 rounded-lg shadow-lg max-w-lg mx-auto">
                        <p className="text-center text-white">
                            {message}
                        </p>
                        <button
                            onClick={handleOkClick}
                            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 mx-auto block"
                        >
                            OK
                        </button>
                    </div>
                )
            }
        </div>
    )
}