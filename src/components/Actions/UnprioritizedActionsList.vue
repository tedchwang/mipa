<template>
  <div>
    <q-table
      title="Actions"
      :data="actions"
      :columns="columns"
      row-key="id"
      :filter="filter"
      :loading="loading"
      :pagination.sync="pagination"
      @row-click="onRowClick"
    >
      <template v-slot:top>
        <div class="col-2 q-table__title">事項</div>

        <!-- <q-btn
          @click="showAddAction = true"
          round
          class="all-pointer-events"
          color="primary"
          size="16px"
          icon="add"
        />-->
        <q-btn color="primary" :disable="loading" label="新增" @click="showAddAction = true" />

        <!--
        <q-btn
          color="primary"
          :disable="loading"
          label="Add row"
          @click="addRow"
        />
        <q-btn
          class="q-ml-sm"
          color="primary"
          :disable="loading"
          label="Remove row"
          @click="removeRow"
        />
        -->
        <q-space />
        <q-input dense debounce="300" color="primary" v-model="filter">
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
      </template>
    </q-table>
    <q-dialog v-model="showAddAction">
      <add-action @close="showAddAction = false" />
    </q-dialog>
  </div>
</template>

<script>
import { mapGetters, mapState } from "vuex";
import { firebase, firebaseApp, firebaseDb, firebaseAuth } from "boot/firebase";
export default {
  components: {
    "add-action": require("components/Actions/Modals/AddAction.vue").default,
  },
  data() {
    return {
      showAddAction: false,
      loading: false,
      filter: "",
      //rowCount: 10, //only used in sample code; delete when not needed anymore
      pagination: {
        page: 1,
        rowsPerPage: 20,
        // rowsNumber: xx if getting data from a server
      },
      columns: [
        {
          name: "title",
          required: true,
          label: "標題",
          align: "left",
          field: (row) => row.title,
          sortable: true,
        },
        {
          name: "dueDate",
          align: "center",
          label: "截止日期",
          field: "dueDate",
          sortable: true,
        },
      ],
    };
  },

  computed: {
    //...mapGetters("settings", ["settings"]),
    ...mapState("actions", ["actions"]),
  },

  methods: {
    onRowClick(evt, row) {
      console.log("clicked on", row.id);
      this.$store.dispatch("ui/setSelectedActionId", row.id);
    },
    // emulate fetching data from server
    addRow() {
      this.loading = true;
      setTimeout(() => {
        const index = Math.floor(Math.random() * (this.data.length + 1)),
          row = this.original[Math.floor(Math.random() * this.original.length)];
        if (this.data.length === 0) {
          this.rowCount = 0;
        }
        row.id = ++this.rowCount;
        const addRow = { ...row }; // extend({}, row, { name: `${row.name} (${row.__count})` })
        this.data = [
          ...this.data.slice(0, index),
          addRow,
          ...this.data.slice(index),
        ];
        this.loading = false;
      }, 500);
    },

    removeRow() {
      this.loading = true;
      setTimeout(() => {
        const index = Math.floor(Math.random() * this.data.length);
        this.data = [
          ...this.data.slice(0, index),
          ...this.data.slice(index + 1),
        ];
        this.loading = false;
      }, 500);
    },
  },
};
</script>
