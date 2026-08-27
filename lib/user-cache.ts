export type CachedUserAccess = {
  role: 'admin' | 'subscriber';
  is_enabled: boolean;
};


const CACHE_KEY =
  'library_user_access';


export function saveUserAccess(
  data: CachedUserAccess
) {

  try {

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(data)
    );

  } catch (error) {

    console.log(
      'Unable to save user cache:',
      error
    );

  }

}


export function getUserAccess():
CachedUserAccess | null {

  try {

    const value =
      localStorage.getItem(
        CACHE_KEY
      );


    if (!value) {
      return null;
    }


    return JSON.parse(
      value
    ) as CachedUserAccess;


  } catch (error) {

    console.log(
      'Unable to read user cache:',
      error
    );

    return null;

  }

}


export function clearUserAccess() {

  try {

    localStorage.removeItem(
      CACHE_KEY
    );

  } catch {}

}