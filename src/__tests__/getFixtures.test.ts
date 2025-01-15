import { getFixtures } from "@/app/util/dataFetch/fetchData";

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
})

afterEach(() => {
    jest.restoreAllMocks();
})

it('returns empty fixtures for all leagues when API fails', async () => {
    global.fetch = jest.fn(() => Promise.reject('API Error')) as jest.Mock;
    const season = 2025;
    const data = await getFixtures(season);
    expect(data).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                name: expect.any(String),
                fixtures: []
        })
        ])
    )
})

it('handles empty response from API gracefully', async () => {
    global.fetch = jest.fn(() => Promise.resolve({json: () => Promise.resolve({ response: [] })})) as jest.Mock;
    const season = 2025;
    const data = await getFixtures(season);
    expect(data).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                name: expect.any(String),
                fixtures: []
            })
        ])
    )
})