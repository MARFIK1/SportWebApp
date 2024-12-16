import LoadingComponent from "../components/common/LoadingComponent";

export default function Loading() {
    return (
        <div className="flex flex-col w-full justify-center items-center h-screen">
            <LoadingComponent 
                color="white" 
            />
        </div>
    )
}