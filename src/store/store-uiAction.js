import { getField, updateField } from "vuex-map-fields";

const fieldsToTriggerRecalculation = [
  "estEffortHrs",
  "effortCompletionPercentage",
  "estSpending",
  "spentAmount"
];

const state = {
  uiAction: {},
  uiActionChanged: false
};

const mutations = {
  setUiAction(state, action) {
    state.uiAction = action;
    state.uiActionChanged = false;
  },
  updateUiActionField(state, field) {
    let fieldName = field.path.replace("uiAction.", "");
    updateField(state, field);
    //if (fieldsToTriggerRecalculation.includes(fieldName)) recalculate(state);
    state.uiActionChanged = true;
    //console.log("updated", state.uiAction[fieldName]);
  },
  addImpact(state, impact) {
    state.uiAction.impacts.push(impact);
    state.uiActionChanged = true;
  },
  updateImpact(state, impact) {
    let index = state.uiAction.impacts.map(imp => imp.id).indexOf(impact.id);
    state.uiAction.impacts[index] = impact;
    state.uiActionChanged = true;
  },
  deleteImpact(state, impactId) {
    state.uiAction.impacts = state.uiAction.impacts.filter(impact => {
      return impact.id != impactId;
    });
    state.uiActionChanged = true;
  }
};

/*function recalculate(state) {
  //console.log("recalculating");
  let uiAction = state.uiAction;
  uiAction.estEffortCostXdr = uiAction.estEffortCostXdr
    ? uiAction.estEffortCostXdr
    : 0;
  uiAction.estSpending = uiAction.estSpending
    ? uiAction.estSpending
    : 0;
  uiAction.estTotalCostXdr =
    uiAction.estEffortCostXdr + uiAction.estSpending;
  uiAction.effortCompletionPercentage = uiAction.effortCompletionPercentage
    ? uiAction.effortCompletionPercentage
    : 0;
  uiAction.outstandingEffortCost =
    uiAction.estEffortCostXdr * (1 - uiAction.effortCompletionPercentage / 100);
  uiAction.spentAmount = uiAction.spentAmount
    ? uiAction.spentAmount
    : 0;
  uiAction.outstandingPurchaseCost = Math.max(
    0,
    uiAction.estSpending - uiAction.spentAmount
  );
  uiAction.outstandingCostXdr =
    uiAction.outstandingEffortCost + uiAction.outstandingPurchaseCost;
  uiAction.estRoi =
    (uiAction.estTotalBenefitXdr - uiAction.outstandingCostXdr) /
    uiAction.outstandingCostXdr;
}*/

const actions = {
  setUiAction({ commit }, action) {
    commit("setUiAction", action);
  }
};

const getters = { getField };

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
