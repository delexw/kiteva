import { translateUi, useUiLanguage } from "../i18n";
import { CheckCircle2 } from "lucide-react";
import type { PreparationState } from "../../shared/preparation";
import { preparationSteps, preparationStepNames } from "../../shared/preparation";

const stateNames = {
  completed: "Complete",
  running: "In progress",
  failed: "Needs retry",
  interrupted: "Interrupted",
};
export function PreparationCheckpoints({ preparation }: { preparation: PreparationState }) {
  useUiLanguage();
  return (
    <ul className="preparation-checkpoints" aria-label={translateUi("Preparation checkpoints")}>
      {preparationSteps.map((step) => {
        const checkpoint = preparation.checkpoints[step];
        if (!checkpoint) return null;
        return (
          <li key={step} data-state={checkpoint.state}>
            {checkpoint.state === "completed" && <CheckCircle2 size={14} aria-hidden="true" />}
            {preparationStepNames[step]} · {stateNames[checkpoint.state]}
          </li>
        );
      })}
    </ul>
  );
}
