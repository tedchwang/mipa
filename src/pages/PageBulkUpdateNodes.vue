<template>
  <q-page padding>
    <div class="text-h5">
      <span v-if="currentOrg">{{ currentOrg.goal }}</span>
    </div>
    <div class="row q-pb-md">
      {{ currentModel ? currentModel.name : "" }}
      {{ currentModel ? (currentModel.isOrgMainModel ? " (main)" : "") : "" }}
    </div>
    <div class="row q-pb-md">
      This page helps you quickly update the latest values of nodes in your
      model. Follow the steps below.
    </div>
    <div class="row">
      <div class="col-12 col-md-3 print-hide"></div>

      <div class="col-12 col-md-6">
        <div class="q-pa-md">
          <p>Step 1. Copy and paste the update template into a spreadsheet.</p>
          <div class="column items-center">
            <q-btn
              color="primary"
              label="Copy update template to clipboard"
              @click="copyUpdateTemplateToClipboard()"
            />
          </div>
        </div>
        <div class="q-pa-md">
          <p>
            Step 2. Make your changes in the spreadsheet. You may change fields
            in any column except Node ID. Be careful, as your changes will not
            be validated before they are saved.
          </p>
        </div>

        <div class="q-pa-md">
          <p>
            Step 3. Copy and paste your edited version into the area below and
            submit.
          </p>
          <div>
            <q-input v-model="text" filled type="textarea" />
          </div>
          <div class="column items-center q-pa-md">
            <q-btn
              color="primary"
              label="Submit"
              @click="processInputTsvText()"
            />
          </div>
        </div>
      </div>
      <div class="col-12 col-md-3 print-hide"></div>
    </div>
  </q-page>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
//import idb from "src/api/idb";
import { copyToClipboard } from "quasar";
import { showErrorMessage } from "src/utils/util-show-error-message";
import { stripScriptTags } from "src/utils/util-stripTags";

const parse = require("csv-parse/lib/sync");

export default {
  components: {},
  data() {
    return { text: "" };
  },
  computed: {
    ...mapState("orgs", ["currentOrg"]),
    ...mapState("model", ["currentModel"]),
    ...mapGetters("model", ["nodes"]),
    ...mapGetters("users", ["currentOrgUsers"]),
  },

  methods: {
    copyUpdateTemplateToClipboard() {
      let tsvContent = this.prepUpdateTemplate(this.nodes)
        .map((e) => e.join("\t"))
        .join("\n");
      copyToClipboard(tsvContent)
        .then(() => {
          this.$q.notify("Template copied. Ready to paste into spreadsheet.");
        })
        .catch(() => {
          this.$q.notify({
            type: "warning",
            color: "warning",
            timeout: 1000,
            position: "center",
            message: "Oops. Something went wrong!",
          });
        });
    },

    processInputTsvText() {
      let records;
      try {
        records = parse(this.text, {
          bom: true,
          columns: true,
          delimiter: ["\t"],
          skip_empty_lines: true,
          trim: true,
        });
      } catch (err) {
        console.log(err);
        showErrorMessage("Error parsing data", err.message);
      }

      //compare new records to existing data
      let errorOccurred = false;
      let changedNodes = [];
      let numChangedFields = 0;
      let numChangedNodes = 0;
      const fieldsToCompare = [
        { dbName: "name", tsvName: "Name" },
        { dbName: "symbol", tsvName: "Symbol" },
        { dbName: "unit", tsvName: "Unit" },
        { dbName: "symbolFormula", tsvName: "Formula" },
        { dbName: "latestValue", tsvName: "Latest value" },
        { dbName: "responsiblePerson", tsvName: "Responsible person" },
      ];
      records.forEach((record, index) => {
        if (!errorOccurred) {
          let foundNode = this.nodes.find(
            (node) => node.id == record["Node ID"]
          );
          if (foundNode) {
            let originals = {};
            let changes = {};
            let originalsForConfirmationDialog = {};
            let changesForConfirmationDialog = {};
            let latestValueExistenceChanged = false;
            let symbolChanged = false;
            //compare fields and add to updates array
            fieldsToCompare.forEach((field) => {
              let newValue = "";
              let newValueForConfirmationDialog = "";
              let originalValueForConfirmationDialog = "";
              switch (field.tsvName) {
                case "Responsible person":
                  if (record["Responsible person"]) {
                    let foundUser = null;
                    let foundOriginalUser = null;
                    foundUser = this.currentOrgUsers.find(
                      (u) => u.email == record["Responsible person"]
                    );
                    if (foundUser) {
                      newValue = foundUser.id;
                      newValueForConfirmationDialog = foundUser.email;
                    } else {
                      errorOccurred = true;
                      showErrorMessage(
                        "Error matching responsible person",
                        `Email not found: "${
                          record["Responsible person"]
                        }" on line "${index + 2}"`
                      );
                    }
                    if (foundNode["responsiblePerson"]) {
                      foundOriginalUser = this.currentOrgUsers.find(
                        (u) => u.id == foundNode["responsiblePerson"]
                      );
                      if (foundOriginalUser) {
                        originalValueForConfirmationDialog =
                          foundOriginalUser.email;
                      }
                    }
                  }
                  break;
                default:
                  newValue = stripScriptTags(record[field.tsvName]);
                  if (newValue != record[field.tsvName])
                    console.log(
                      `stripped script tags for ${
                        record[field.tsvName]
                      } to ${newValue}`
                    );
                  newValueForConfirmationDialog = newValue;
                  originalValueForConfirmationDialog = foundNode[field.dbName];
                //originals[field.dbName] = foundNode[field.dbName];
              }
              if (
                foundNode[field.dbName] != newValue &&
                !(
                  typeof foundNode[field.dbName] == "undefined" &&
                  newValue == ""
                )
              ) {
                changes[field.dbName] = newValue;
                changesForConfirmationDialog[
                  field.dbName
                ] = newValueForConfirmationDialog;
                originals[field.dbName] = foundNode[field.dbName];
                originalsForConfirmationDialog[
                  field.dbName
                ] = originalValueForConfirmationDialog;
                if (field.dbName == "symbol") symbolChanged = true;
                if (field.dbName == "latestValue") {
                  let oldLatestVal = foundNode.latestValue;
                  let newLatestVal = stripScriptTags(record["Latest value"]);
                  let oldLatestValIsANumber =
                    typeof oldLatestVal != "undefined" &&
                    oldLatestVal !== "" &&
                    !isNaN(Number(oldLatestVal));
                  let newLatestValIsANumber =
                    typeof newLatestVal != "undefined" &&
                    newLatestVal !== "" &&
                    !isNaN(Number(newLatestVal));
                  latestValueExistenceChanged =
                    oldLatestValIsANumber != newLatestValIsANumber;
                }
                numChangedFields++;
              }
            });
            if (Object.keys(changes).length > 0) {
              changedNodes.push({
                id: foundNode.id,
                name: foundNode.name,
                originals,
                changes,
                originalsForConfirmationDialog,
                changesForConfirmationDialog,
                latestValueExistenceChanged,
                symbolChanged,
              });
              numChangedNodes++;
            }
            //dispatch store action to batch write to firestore
          } else {
            errorOccurred = true;
            showErrorMessage(
              "Error matching data",
              `Node ID not found: "${record["Node ID"]}" on line "${index + 2}"`
            );
          }
        }
      });
      if (errorOccurred) return;
      //console.log({ changedNodes });
      if (changedNodes.length) {
        this.confirmToUpdate({
          changedNodes,
          numChangedFields,
          numChangedNodes,
        });
      } else showErrorMessage("No changes found", "The data has not changed.");
    },

    confirmToUpdate(payload) {
      let message = `Compared to database, ${payload.numChangedFields} change(s) found in ${payload.numChangedNodes} node(s):<br>`;
      message +=
        "<table> <tr> <th>Node</th> <th>Field</th> <th>Change</th> </tr>";
      payload.changedNodes.forEach((node) => {
        for (const property in node.changes) {
          message += "<tr>";
          message += `<td class="text-nowrap">${node.name}</td>`;
          message += `<td>${property}</td>`;
          message += `<td>${node.originalsForConfirmationDialog[property]} → ${node.changesForConfirmationDialog[property]}</td>`;
          message += "</tr>";
        }
      });
      message += "</table>";
      this.$q
        .dialog({
          title: "Confirm values to update",
          message: message,
          cancel: true,
          persistent: true,
          html: true,
        })
        .onOk(() => {
          // console.log('>>>> OK')
          let payloadToStore = {
            modelId: this.currentModel.id,
            changedNodes: payload.changedNodes,
          };
          this.$store.dispatch("model/updateNodes", payloadToStore);
        })
        .onOk(() => {
          // console.log('>>>> second OK catcher')
        })
        .onCancel(() => {
          // console.log('>>>> Cancel')
        })
        .onDismiss(() => {
          // console.log('I am triggered on both OK and Cancel')
        });
    },

    prepUpdateTemplate(nodes) {
      let that = this;
      let tempRow = [];
      let rows = [];
      let sortedNodes = JSON.parse(JSON.stringify(nodes)).sort(sortByName);

      //compose header row
      tempRow = [
        "Name",
        "Symbol",
        "Unit",
        "Formula",
        "Node ID",
        "Latest value",
        "Responsible person",
      ];
      rows.push(tempRow);

      //compose values rows
      sortedNodes.forEach(function (node) {
        let responsiblePersonEmail = null;
        let foundUser = null;
        if (node.responsiblePerson) {
          foundUser = that.currentOrgUsers.find(
            (u) => u.id == node.responsiblePerson
          );
        }
        if (foundUser) responsiblePersonEmail = foundUser.email;
        tempRow = [
          node.name,
          node.symbol,
          node.unit,
          node.symbolFormula,
          node.id,
          node.latestValue,
          responsiblePersonEmail,
        ];
        rows.push(tempRow);
      });

      return rows;
    },
  },

  watch: {},
  created() {
    (async () => {
      //console.log("waiting for currentUser to be defined");
      while (
        !firebaseAuth.currentUser // define the condition as you like
      )
        await new Promise((resolve) => setTimeout(resolve, 200));
      //bind to list of models the org-user can view
      //(user is in model's owners, editors, or viewers)
      //this.$store.dispatch("orgs/bindReadableModels", this.$route.params.orgId);
      let modelId = this.$route.params.orgId;
      this.$store.dispatch("model/bindCurrentModel", modelId);
      this.$store.dispatch("model/bindNodes", modelId);
      this.$store.dispatch("adHocDocs/bindExchangeRates");
      this.$store.dispatch("calcResults/loadBaseline", modelId);
    })();
    //console.log("above code doesn't block main function stack");
  },
  mounted() {},
};

function sortByName(a, b) {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
}
</script>

<style>
table {
  border: 1px solid #333;
}
td {
  padding: 5px;
}
tr:nth-child(even) {
  background-color: #eee;
}
</style>