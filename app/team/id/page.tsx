type PageProps = {
    params: {
        id: string;
    }
}

export default function Team({
    params
} : PageProps){
    return (
        <div className="flex justify-center items-center text-neutral-100">
            {params.id}
        </div>
    )
}