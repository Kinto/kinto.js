from pyramid.view import view_config
from pyramid.security import remember, forget

@view_config(route_name='login', request_method='POST')
def login(request):
    username = request.params['username']
    password = request.params['password']

    if check_credentials(username, password):
        headers = remember(request, username)
        return HTTPFound(location="/", headers=headers)
    return HTTPUnauthorized()
