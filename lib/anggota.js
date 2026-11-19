"use strict";

/**
 * Anggota tim 201FUL — daftar referal donasi.
 * Nama harus sama persis dengan yang tampil di tim.html.
 */
const DIVISI = [
  {
    nama: "Program & Event Concept",
    anggota: ["Reza Fawzy", "Helmy Alvian", "Hasna Naurah", "Rianti Adellia Savitri", "Rian Saepuloh"]
  },
  {
    nama: "Partnership, Sponsorship & Fundraising",
    anggota: [
      "Alvin Iswanto",
      "Siswanto Nandja",
      "Ahmad Yasser Halim Putra",
      "Ahmad Fachrur Rival",
      "Achyar Islami Amir",
      "Emysha Eka Cahaya Agustiya"
    ]
  },
  {
    nama: "Finance, Logistic & Operational",
    anggota: [
      "Aryamukti Satria",
      "Nur Suwangsih",
      "Ratna Amilia",
      "Diah Nugraheni",
      "Christian Vicko Yogananda Soelistiarso"
    ]
  },
  {
    nama: "Participant, Kids Activity & Safety",
    anggota: [
      "Mesta Farid",
      "Andi Rahma",
      "Saiful Awal",
      "Viana Nona Tadya",
      "Febelia Devina Setyadarma",
      "Gusti Winih Stiani"
    ]
  },
  {
    nama: "Creative, Design & Documentation",
    anggota: [
      "J. Aksan Saputra",
      "Nadira Clarissa Hilman",
      "Edore",
      "Candra Nova Nurdiansyah",
      "Wahyu Nurhidayat Rusman",
      "Pitha Putri Yani",
      "Ardiansyah",
      "Arif Chasan"
    ]
  },
  {
    nama: "Senior & Koordinator",
    anggota: ["Patrya", "Abby", "Riwi", "Mamay", "Ari"]
  }
];

const ANGGOTA = DIVISI.reduce(
  (semua, divisi) => semua.concat(divisi.anggota.map((nama) => ({ nama, divisi: divisi.nama }))),
  []
);

const NAMA_ANGGOTA = new Set(ANGGOTA.map((anggota) => anggota.nama));

module.exports = { DIVISI, ANGGOTA, NAMA_ANGGOTA };
