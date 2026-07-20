// Focal Point Church - growth group drift (real). Members who were regular
// attenders this past season then went quiet (>=5 meetings attended, quiet 8+
// weeks, before the summer wind-down). Leaders-of-own-group artifacts filtered.
// LOCAL OVERRIDE (skip-worktree); committed version is representative.
export interface GroupDrifter { name: string; group: string; attended: number; weeksSince: number }
export const focalPointGroupDrift: { flagged: number; groups: number; people: GroupDrifter[] } = {
  flagged: 160, groups: 52,
  people: [
  {
    "name": "Group Member 1",
    "group": "Young Adult · Oscar Mens' Group",
    "attended": 33,
    "weeksSince": 16
  },
  {
    "name": "Group Member 2",
    "group": "Eric Campbell · Monday Night · Men Gro",
    "attended": 26,
    "weeksSince": 11
  },
  {
    "name": "Group Member 3",
    "group": "FPC Brasil · Ronaldo & Raquel · Hunter",
    "attended": 26,
    "weeksSince": 10
  },
  {
    "name": "Group Member 4",
    "group": "Eric Campbell · Monday Night · Men Gro",
    "attended": 23,
    "weeksSince": 11
  },
  {
    "name": "Group Member 5",
    "group": "Guillermo Moreno · Monday Night · Men ",
    "attended": 22,
    "weeksSince": 12
  },
  {
    "name": "Group Member 6",
    "group": "Young Adult · Alyssa King Womens Group",
    "attended": 22,
    "weeksSince": 16
  },
  {
    "name": "Group Member 7",
    "group": "Young Adult · Manny & Dimitri Men Grou",
    "attended": 21,
    "weeksSince": 14
  },
  {
    "name": "Group Member 8",
    "group": "Young Adult · Oscar Mens' Group",
    "attended": 21,
    "weeksSince": 25
  },
  {
    "name": "Group Member 9",
    "group": "Faith Knight Wednesday Morning Women G",
    "attended": 21,
    "weeksSince": 14
  },
  {
    "name": "Group Member 10",
    "group": "Brianna Aleman Womens Group",
    "attended": 20,
    "weeksSince": 11
  },
  {
    "name": "Group Member 11",
    "group": "Guillermo Moreno · Monday Night · Men ",
    "attended": 20,
    "weeksSince": 12
  },
  {
    "name": "Group Member 12",
    "group": "Young Adult · Karlenn Womens Group",
    "attended": 20,
    "weeksSince": 18
  },
  {
    "name": "Group Member 13",
    "group": "Young Adult · Karlenn Womens Group",
    "attended": 20,
    "weeksSince": 18
  },
  {
    "name": "Group Member 14",
    "group": "FPC Brasil · Ricardo & Sara · Kissimme",
    "attended": 20,
    "weeksSince": 8
  },
  {
    "name": "Group Member 15",
    "group": "Young Adult · Karlenn Womens Group",
    "attended": 19,
    "weeksSince": 18
  },
  {
    "name": "Group Member 16",
    "group": "Young Adult · Alyssa King Womens Group",
    "attended": 19,
    "weeksSince": 16
  },
  {
    "name": "Group Member 17",
    "group": "Young Adult · Alyssa King Womens Group",
    "attended": 19,
    "weeksSince": 16
  },
  {
    "name": "Group Member 18",
    "group": "Betty Setien Thursday Night Women Grou",
    "attended": 18,
    "weeksSince": 12
  },
  {
    "name": "Group Member 19",
    "group": "Ellie Rivera Women Group",
    "attended": 18,
    "weeksSince": 15
  },
  {
    "name": "Group Member 20",
    "group": "Young Adult · Briana Womens' Group",
    "attended": 18,
    "weeksSince": 19
  },
  {
    "name": "Group Member 21",
    "group": "Young Adult · Briana Womens' Group",
    "attended": 18,
    "weeksSince": 19
  },
  {
    "name": "Group Member 22",
    "group": "Eric Campbell · Monday Night · Men Gro",
    "attended": 17,
    "weeksSince": 13
  },
  {
    "name": "Group Member 23",
    "group": "Eric Campbell · Monday Night · Men Gro",
    "attended": 17,
    "weeksSince": 12
  },
  {
    "name": "Group Member 24",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 17,
    "weeksSince": 12
  },
  {
    "name": "Group Member 25",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 17,
    "weeksSince": 12
  },
  {
    "name": "Group Member 26",
    "group": "Guillermo Moreno · Monday Night · Men ",
    "attended": 17,
    "weeksSince": 13
  },
  {
    "name": "Group Member 27",
    "group": "Ellie Rivera Women Group",
    "attended": 17,
    "weeksSince": 15
  },
  {
    "name": "Group Member 28",
    "group": "Young Adult · Alyssa King Womens Group",
    "attended": 17,
    "weeksSince": 16
  },
  {
    "name": "Group Member 29",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 16,
    "weeksSince": 12
  },
  {
    "name": "Group Member 30",
    "group": "Guillermo Moreno · Monday Night · Men ",
    "attended": 16,
    "weeksSince": 11
  },
  {
    "name": "Group Member 31",
    "group": "Young Adult · Manny & Dimitri Men Grou",
    "attended": 16,
    "weeksSince": 14
  },
  {
    "name": "Group Member 32",
    "group": "Young Adult · Karlenn Womens Group",
    "attended": 16,
    "weeksSince": 18
  },
  {
    "name": "Group Member 33",
    "group": "Nicole Garcia · Thursday Night · Women",
    "attended": 16,
    "weeksSince": 15
  },
  {
    "name": "Group Member 34",
    "group": "Young Adult · Briana Womens' Group",
    "attended": 16,
    "weeksSince": 19
  },
  {
    "name": "Group Member 35",
    "group": "Dave Thomas' · Monday Night · Men Grow",
    "attended": 15,
    "weeksSince": 19
  },
  {
    "name": "Group Member 36",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 15,
    "weeksSince": 17
  },
  {
    "name": "Group Member 37",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 15,
    "weeksSince": 17
  },
  {
    "name": "Group Member 38",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 15,
    "weeksSince": 17
  },
  {
    "name": "Group Member 39",
    "group": "Andrew & Alyssa Daniel · Monday Night ",
    "attended": 15,
    "weeksSince": 12
  },
  {
    "name": "Group Member 40",
    "group": "Young Adult · Manny & Dimitri Men Grou",
    "attended": 15,
    "weeksSince": 14
  },
  {
    "name": "Group Member 41",
    "group": "FPC Brasil · Ricardo & Sara · Kissimme",
    "attended": 15,
    "weeksSince": 8
  },
  {
    "name": "Group Member 42",
    "group": "Young Adult · Briana Womens' Group",
    "attended": 15,
    "weeksSince": 20
  },
  {
    "name": "Group Member 43",
    "group": "Young Adult · Briana Womens' Group",
    "attended": 15,
    "weeksSince": 19
  },
  {
    "name": "Group Member 44",
    "group": "Johnnie & Dawnita Anderson · Wednesday",
    "attended": 15,
    "weeksSince": 14
  },
  {
    "name": "Group Member 45",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 14,
    "weeksSince": 12
  },
  {
    "name": "Group Member 46",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 14,
    "weeksSince": 20
  },
  {
    "name": "Group Member 47",
    "group": "Guillermo Moreno · Monday Night · Men ",
    "attended": 14,
    "weeksSince": 13
  },
  {
    "name": "Group Member 48",
    "group": "Guillermo Moreno · Monday Night · Men ",
    "attended": 14,
    "weeksSince": 13
  },
  {
    "name": "Group Member 49",
    "group": "Rob Matos · Monday Night · Men Group",
    "attended": 14,
    "weeksSince": 15
  },
  {
    "name": "Group Member 50",
    "group": "Ellie Rivera Women Group",
    "attended": 14,
    "weeksSince": 18
  },
  {
    "name": "Group Member 51",
    "group": "Young Adult · Karlenn Womens Group",
    "attended": 14,
    "weeksSince": 20
  },
  {
    "name": "Group Member 52",
    "group": "Juan Pablo & Jackie Spanish Group",
    "attended": 14,
    "weeksSince": 22
  },
  {
    "name": "Group Member 53",
    "group": "FPC Brasil · Clayton & Florence · Dave",
    "attended": 14,
    "weeksSince": 15
  },
  {
    "name": "Group Member 54",
    "group": "Johnnie & Dawnita Anderson · Wednesday",
    "attended": 14,
    "weeksSince": 19
  },
  {
    "name": "Group Member 55",
    "group": "Will Walters · Monday Night · Men Grow",
    "attended": 13,
    "weeksSince": 12
  },
  {
    "name": "Group Member 56",
    "group": "Andrew & Alyssa Daniel · Monday Night ",
    "attended": 13,
    "weeksSince": 17
  },
  {
    "name": "Group Member 57",
    "group": "Young Adult · Alyssa King Womens Group",
    "attended": 13,
    "weeksSince": 16
  },
  {
    "name": "Group Member 58",
    "group": "Young Adult · Alyssa King Womens Group",
    "attended": 13,
    "weeksSince": 17
  },
  {
    "name": "Group Member 59",
    "group": "FPC Brasil · Ricardo & Sara · Kissimme",
    "attended": 13,
    "weeksSince": 8
  },
  {
    "name": "Group Member 60",
    "group": "Mernela Anez · Wednesday Night · Women",
    "attended": 13,
    "weeksSince": 19
  }
],
}
