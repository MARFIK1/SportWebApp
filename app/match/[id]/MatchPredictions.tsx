import { ModelPrediction } from "@/types/predictions";
import { getServerT } from "@/app/util/i18n/getLocale";

interface MatchPredictionsProps {
    models: [string, ModelPrediction][];
}

export default function MatchPredictions({ models }: MatchPredictionsProps) {
    const t = getServerT();

    return (
        <div className="bg-white dark:bg-gray-900/50 rounded-2xl p-6 mt-8">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">{t("all_model_predictions")}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-2">{t("model")}</th>
                            <th className="text-center py-3 px-2">{t("prediction")}</th>
                            <th className="text-center py-3 px-2">{t("home_pct")}</th>
                            <th className="text-center py-3 px-2">{t("draw_pct")}</th>
                            <th className="text-center py-3 px-2">{t("away_pct")}</th>
                            <th className="text-center py-3 px-2">{t("confidence")}</th>
                            <th className="text-center py-3 px-2">{t("result")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {models.map(([name, pred]) => (
                            <tr key={name} className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800/50">
                                <td className="py-3 px-2 font-semibold text-gray-900 dark:text-white">{name}</td>
                                <td className="text-center py-3 px-2">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        pred.prediction === "HOME" ? "bg-emerald-600/30 text-emerald-400" :
                                        pred.prediction === "AWAY" ? "bg-blue-600/30 text-blue-400" :
                                        "bg-yellow-600/30 text-yellow-400"
                                    }`}>
                                        {pred.prediction}
                                    </span>
                                </td>
                                <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.HOME?.toFixed(1)}%</td>
                                <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.DRAW?.toFixed(1)}%</td>
                                <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{pred.probabilities.AWAY?.toFixed(1)}%</td>
                                <td className="text-center py-3 px-2">
                                    <span className={`font-semibold ${pred.confidence >= 60 ? "text-emerald-400" : pred.confidence >= 45 ? "text-yellow-400" : "text-gray-500 dark:text-gray-400"}`}>
                                        {pred.confidence.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="text-center py-3 px-2">
                                    {pred.correct !== undefined && (
                                        <span className={`text-xs font-bold ${pred.correct ? "text-emerald-400" : "text-red-400"}`}>
                                            {pred.correct ? "\u2713" : "\u2717"}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
