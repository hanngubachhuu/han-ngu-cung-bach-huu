/* HÁN NGỮ CÙNG BÁCH HỮU — LESSON DATA SCHEMA
 * Version 2
 * Canonical fields live under LESSON.content.
 * Legacy LESSON.sections / LESSON.questions remain temporarily for page compatibility.
 */
(function(global){
  const SCHEMA_VERSION = 2;
  const REQUIRED = [
    'course','meta','vocabulary','grammar','hanzi','exampleSentences',
    'commonErrors','skills','exercises','passages','coverage'
  ];
  function emptyContent(){
    return {
      course:{system:'HSK',level:null,lessonNo:null,textbook:'Giáo trình chuẩn HSK',titleZh:'',titleVi:''},
      meta:{timeLimitMinutes:null,version:1},
      vocabulary:[],
      grammar:[],
      sentencePatterns:[],
      dialogues:[],
      hanzi:[],
      exampleSentences:[],
      commonErrors:[],
      skills:{vocabulary:[],grammar:[],reading:[],translation:[],writing:[],speaking:[],mixed:[]},
      exercises:{all:[],vocabulary:[],grammar:[],reading:[],translation:[],writing:[],speaking:[],mixed:[]},
      passages:[],
      reviewLinks:[],
      oldWordReuse:{enabled:false,sourceLessons:[],strategy:null},
      difficulty:{},
      teachingMetadata:{},
      coverage:{}
    };
  }
  function validate(lesson){
    const c=lesson&&lesson.content;
    const missing=REQUIRED.filter(k=>!(c&&Object.prototype.hasOwnProperty.call(c,k)));
    return {ok:missing.length===0,schemaVersion:lesson?.schemaVersion||null,missing};
  }
  global.HANNGU_LESSON_SCHEMA={version:SCHEMA_VERSION,required:REQUIRED,emptyContent,validate};
})(window);
