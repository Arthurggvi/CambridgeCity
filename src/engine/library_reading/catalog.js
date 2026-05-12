const LIBRARY_READING_CATALOGS = Object.freeze({
  west2_outpost_library_center: Object.freeze({
    id: "west2_outpost_library_center_reading_room",
    mapId: "west2_outpost_library_center",
    sceneId: "west2_outpost_library_reading",
    actionId: "read_random_library_book",
    maxDailyReads: 3,
    bookIds: Object.freeze([
      "west2_library_book_on_the_origin_of_species",
      "west2_library_book_mathematical_principles_of_natural_philosophy",
      "west2_library_book_on_the_revolutions_of_the_heavenly_spheres",
      "west2_library_book_two_new_sciences_dialogue",
      "west2_library_book_treatise_on_electricity_and_magnetism",
      "west2_library_book_de_motu_cordis",
      "west2_library_book_principles_of_geology",
      "west2_library_book_new_system_of_chemical_philosophy",
      "west2_library_book_descent_of_man",
      "west2_library_book_souvenirs_entomologiques",
      "west2_library_book_cosmos",
      "west2_library_book_analytical_theory_of_heat",
      "west2_library_book_experimental_researches_in_electricity",
      "west2_library_book_handbook_of_physiological_optics",
      "west2_library_book_dialogue_concerning_two_chief_world_systems",
      "west2_library_book_elements",
      "west2_library_book_war_and_peace",
      "west2_library_book_pride_and_prejudice",
      "west2_library_book_david_copperfield",
      "west2_library_book_the_red_and_the_black",
      "west2_library_book_crime_and_punishment",
      "west2_library_book_anna_karenina",
      "west2_library_book_wuthering_heights",
      "west2_library_book_madame_bovary",
      "west2_library_book_a_tale_of_two_cities",
      "west2_library_book_don_quixote",
      "west2_library_book_robinson_crusoe",
      "west2_library_book_gullivers_travels",
      "west2_library_book_oliver_twist",
      "west2_library_book_jane_eyre",
      "west2_library_book_notre_dame_de_paris",
      "west2_library_book_eugenie_grandet",
      "west2_library_book_tess_of_the_durbervilles",
      "west2_library_book_moby_dick",
      "west2_library_book_the_scarlet_letter",
      "west2_library_book_dead_souls"
    ])
  })
});

const BOOK_DEFINITIONS = Object.freeze({
  west2_library_book_on_the_origin_of_species: Object.freeze({
    id: "west2_library_book_on_the_origin_of_species",
    title: "《物种起源》",
    contentId: "west2_library_book_on_the_origin_of_species_001"
  }),
  west2_library_book_mathematical_principles_of_natural_philosophy: Object.freeze({
    id: "west2_library_book_mathematical_principles_of_natural_philosophy",
    title: "《自然哲学的数学原理》",
    contentId: "west2_library_book_mathematical_principles_of_natural_philosophy_001"
  }),
  west2_library_book_on_the_revolutions_of_the_heavenly_spheres: Object.freeze({
    id: "west2_library_book_on_the_revolutions_of_the_heavenly_spheres",
    title: "《天体运行论》",
    contentId: "west2_library_book_on_the_revolutions_of_the_heavenly_spheres_001"
  }),
  west2_library_book_two_new_sciences_dialogue: Object.freeze({
    id: "west2_library_book_two_new_sciences_dialogue",
    title: "《关于两门新科学的对话》",
    contentId: "west2_library_book_two_new_sciences_dialogue_001"
  }),
  west2_library_book_treatise_on_electricity_and_magnetism: Object.freeze({
    id: "west2_library_book_treatise_on_electricity_and_magnetism",
    title: "《电磁学通论》",
    contentId: "west2_library_book_treatise_on_electricity_and_magnetism_001"
  }),
  west2_library_book_de_motu_cordis: Object.freeze({
    id: "west2_library_book_de_motu_cordis",
    title: "《心血运动论》",
    contentId: "west2_library_book_de_motu_cordis_001"
  }),
  west2_library_book_principles_of_geology: Object.freeze({
    id: "west2_library_book_principles_of_geology",
    title: "《地质学原理》",
    contentId: "west2_library_book_principles_of_geology_001"
  }),
  west2_library_book_new_system_of_chemical_philosophy: Object.freeze({
    id: "west2_library_book_new_system_of_chemical_philosophy",
    title: "《化学哲学新体系》",
    contentId: "west2_library_book_new_system_of_chemical_philosophy_001"
  }),
  west2_library_book_descent_of_man: Object.freeze({
    id: "west2_library_book_descent_of_man",
    title: "《人类的由来》",
    contentId: "west2_library_book_descent_of_man_001"
  }),
  west2_library_book_souvenirs_entomologiques: Object.freeze({
    id: "west2_library_book_souvenirs_entomologiques",
    title: "《昆虫记》",
    contentId: "west2_library_book_souvenirs_entomologiques_001"
  }),
  west2_library_book_cosmos: Object.freeze({
    id: "west2_library_book_cosmos",
    title: "《宇宙》",
    contentId: "west2_library_book_cosmos_001"
  }),
  west2_library_book_analytical_theory_of_heat: Object.freeze({
    id: "west2_library_book_analytical_theory_of_heat",
    title: "《热的分析理论》",
    contentId: "west2_library_book_analytical_theory_of_heat_001"
  }),
  west2_library_book_experimental_researches_in_electricity: Object.freeze({
    id: "west2_library_book_experimental_researches_in_electricity",
    title: "《电学实验研究》",
    contentId: "west2_library_book_experimental_researches_in_electricity_001"
  }),
  west2_library_book_handbook_of_physiological_optics: Object.freeze({
    id: "west2_library_book_handbook_of_physiological_optics",
    title: "《生理光学纲要》",
    contentId: "west2_library_book_handbook_of_physiological_optics_001"
  }),
  west2_library_book_dialogue_concerning_two_chief_world_systems: Object.freeze({
    id: "west2_library_book_dialogue_concerning_two_chief_world_systems",
    title: "《关于托勒密和哥白尼两大世界体系的对话》",
    contentId: "west2_library_book_dialogue_concerning_two_chief_world_systems_001"
  }),
  west2_library_book_elements: Object.freeze({
    id: "west2_library_book_elements",
    title: "《几何原本》",
    contentId: "west2_library_book_elements_001"
  }),
  west2_library_book_war_and_peace: Object.freeze({
    id: "west2_library_book_war_and_peace",
    title: "《战争与和平》",
    contentId: "west2_library_book_war_and_peace_001"
  }),
  west2_library_book_pride_and_prejudice: Object.freeze({
    id: "west2_library_book_pride_and_prejudice",
    title: "《傲慢与偏见》",
    contentId: "west2_library_book_pride_and_prejudice_001"
  }),
  west2_library_book_david_copperfield: Object.freeze({
    id: "west2_library_book_david_copperfield",
    title: "《大卫·科波菲尔》",
    contentId: "west2_library_book_david_copperfield_001"
  }),
  west2_library_book_the_red_and_the_black: Object.freeze({
    id: "west2_library_book_the_red_and_the_black",
    title: "《红与黑》",
    contentId: "west2_library_book_the_red_and_the_black_001"
  }),
  west2_library_book_crime_and_punishment: Object.freeze({
    id: "west2_library_book_crime_and_punishment",
    title: "《罪与罚》",
    contentId: "west2_library_book_crime_and_punishment_001"
  }),
  west2_library_book_anna_karenina: Object.freeze({
    id: "west2_library_book_anna_karenina",
    title: "《安娜·卡列尼娜》",
    contentId: "west2_library_book_anna_karenina_001"
  }),
  west2_library_book_wuthering_heights: Object.freeze({
    id: "west2_library_book_wuthering_heights",
    title: "《呼啸山庄》",
    contentId: "west2_library_book_wuthering_heights_001"
  }),
  west2_library_book_madame_bovary: Object.freeze({
    id: "west2_library_book_madame_bovary",
    title: "《包法利夫人》",
    contentId: "west2_library_book_madame_bovary_001"
  }),
  west2_library_book_a_tale_of_two_cities: Object.freeze({
    id: "west2_library_book_a_tale_of_two_cities",
    title: "《双城记》",
    contentId: "west2_library_book_a_tale_of_two_cities_001"
  }),
  west2_library_book_don_quixote: Object.freeze({
    id: "west2_library_book_don_quixote",
    title: "《堂吉诃德》",
    contentId: "west2_library_book_don_quixote_001"
  }),
  west2_library_book_robinson_crusoe: Object.freeze({
    id: "west2_library_book_robinson_crusoe",
    title: "《鲁滨逊漂流记》",
    contentId: "west2_library_book_robinson_crusoe_001"
  }),
  west2_library_book_gullivers_travels: Object.freeze({
    id: "west2_library_book_gullivers_travels",
    title: "《格列佛游记》",
    contentId: "west2_library_book_gullivers_travels_001"
  }),
  west2_library_book_oliver_twist: Object.freeze({
    id: "west2_library_book_oliver_twist",
    title: "《雾都孤儿》",
    contentId: "west2_library_book_oliver_twist_001"
  }),
  west2_library_book_jane_eyre: Object.freeze({
    id: "west2_library_book_jane_eyre",
    title: "《简·爱》",
    contentId: "west2_library_book_jane_eyre_001"
  }),
  west2_library_book_notre_dame_de_paris: Object.freeze({
    id: "west2_library_book_notre_dame_de_paris",
    title: "《巴黎圣母院》",
    contentId: "west2_library_book_notre_dame_de_paris_001"
  }),
  west2_library_book_eugenie_grandet: Object.freeze({
    id: "west2_library_book_eugenie_grandet",
    title: "《欧也妮·葛朗台》",
    contentId: "west2_library_book_eugenie_grandet_001"
  }),
  west2_library_book_tess_of_the_durbervilles: Object.freeze({
    id: "west2_library_book_tess_of_the_durbervilles",
    title: "《苔丝》",
    contentId: "west2_library_book_tess_of_the_durbervilles_001"
  }),
  west2_library_book_moby_dick: Object.freeze({
    id: "west2_library_book_moby_dick",
    title: "《白鲸》",
    contentId: "west2_library_book_moby_dick_001"
  }),
  west2_library_book_the_scarlet_letter: Object.freeze({
    id: "west2_library_book_the_scarlet_letter",
    title: "《红字》",
    contentId: "west2_library_book_the_scarlet_letter_001"
  }),
  west2_library_book_dead_souls: Object.freeze({
    id: "west2_library_book_dead_souls",
    title: "《死魂灵》",
    contentId: "west2_library_book_dead_souls_001"
  })
});

export function getLibraryReadingCatalog(mapId) {
  const key = String(mapId || "").trim();
  return LIBRARY_READING_CATALOGS[key] || null;
}

export function getLibraryReadingBook(bookId) {
  const key = String(bookId || "").trim();
  return BOOK_DEFINITIONS[key] || null;
}

export function listLibraryReadingBooks(catalog) {
  const ids = Array.isArray(catalog?.bookIds) ? catalog.bookIds : [];
  return ids
    .map((bookId) => getLibraryReadingBook(bookId))
    .filter(Boolean);
}